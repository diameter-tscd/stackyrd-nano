package registry

import (
	"fmt"
	"stackyrd-nano/config"
	"stackyrd-nano/pkg/interfaces"
	"stackyrd-nano/pkg/logger"
	"sync"

	"github.com/gin-gonic/gin"
)

// ServiceFactory creates a service instance with dependencies
type ServiceFactory func(config *config.Config, logger *logger.Logger, deps *Dependencies) interfaces.Service

// Global registry of service factories — protected by mu
var (
	serviceFactoriesMu sync.RWMutex
	serviceFactories   = make(map[string]ServiceFactory)

	serviceDiscoveredMu sync.RWMutex
	serviceDiscovered   = make(map[string]interface{})
)

// RegisterService registers a service factory for automatic discovery
func RegisterService(name string, factory ServiceFactory) {
	serviceFactoriesMu.Lock()
	defer serviceFactoriesMu.Unlock()
	serviceFactories[name] = factory
}

// AutoDiscoverServices automatically discovers and creates all enabled services
func AutoDiscoverServices(
	config *config.Config,
	logger *logger.Logger,
	deps *Dependencies,
) []interfaces.Service {
	serviceFactoriesMu.RLock()
	defer serviceFactoriesMu.RUnlock()

	var services []interfaces.Service

	for name, factory := range serviceFactories {
		logger.Debug("Creating service", "name", name)
		if config.Services.IsEnabled(name) {
			if service := factory(config, logger, deps); service != nil {
				services = append(services, service)
				logger.Info("Auto-registered service", "service", name)

				serviceDiscoveredMu.Lock()
				serviceDiscovered[service.Name()] = service.Get()
				serviceDiscoveredMu.Unlock()
			} else {
				logger.Warn("Service factory returned nil", "service", name)
			}
		} else {
			logger.Debug("Service disabled via config", "service", name)
		}
	}

	return services
}

// ServiceRegistry holds discovered services and manages their lifecycle
type ServiceRegistry struct {
	mu      sync.RWMutex
	services []interfaces.Service
	logger   *logger.Logger
}

// NewServiceRegistry creates a new service registry
func NewServiceRegistry(logger *logger.Logger) *ServiceRegistry {
	return &ServiceRegistry{
		services: make([]interfaces.Service, 0),
		logger:   logger,
	}
}

// GetServiceFactories returns a snapshot copy of the global service factories map for testing/debugging
func GetServiceFactories() map[string]ServiceFactory {
	serviceFactoriesMu.RLock()
	defer serviceFactoriesMu.RUnlock()
	copy := make(map[string]ServiceFactory, len(serviceFactories))
	for k, v := range serviceFactories {
		copy[k] = v
	}
	return copy
}

// GetService returns a discovered service by name
func GetService(name string) interface{} {
	serviceDiscoveredMu.RLock()
	defer serviceDiscoveredMu.RUnlock()
	val, ok := serviceDiscovered[name]
	if !ok {
		return nil
	}
	return val
}

// Register adds a service to the registry
func (r *ServiceRegistry) Register(s interfaces.Service) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.services = append(r.services, s)
}

// RegisterServiceWithDependencies creates and registers a service with dependencies
func (r *ServiceRegistry) RegisterServiceWithDependencies(
	config *config.Config,
	logger *logger.Logger,
	deps *Dependencies,
	serviceName string,
) error {
	if factory, exists := GetServiceFactories()[serviceName]; exists {
		if config.Services.IsEnabled(serviceName) {
			service := factory(config, logger, deps)
			if service != nil {
				r.Register(service)
				r.logger.Info("Service registered with dependencies", "service", serviceName)
				return nil
			}
			return fmt.Errorf("failed to create service: %s", serviceName)
		} else {
			r.logger.Debug("Service disabled via config", "service", serviceName)
			return nil
		}
	}
	return fmt.Errorf("service factory not found: %s", serviceName)
}

// GetServices returns a copy of the registered services list
func (r *ServiceRegistry) GetServices() []interfaces.Service {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]interfaces.Service, len(r.services))
	copy(list, r.services)
	return list
}

// Boot initializes enabled services and registers their routes
func (r *ServiceRegistry) Boot(engine *gin.Engine) {
	api := engine.Group("/api/v1")

	for _, s := range r.services {
		if s.Enabled() {
			r.logger.Info("Starting Service...", "service", s.Name())
			s.RegisterRoutes(api)
			r.logger.Info("Service Started", "service", s.Name())
		} else {
			r.logger.Warn("Service Skipped (Disabled via config)", "service", s.Name())
		}
	}
}

// BootService boots a single service (for dynamic registration)
func (r *ServiceRegistry) BootService(engine *gin.Engine, s interfaces.Service) {
	if s.Enabled() {
		api := engine.Group("/api/v1")
		r.logger.Info("Starting Service...", "service", s.Name())
		s.RegisterRoutes(api)
		r.logger.Info("Service Started", "service", s.Name())
	} else {
		r.logger.Warn("Service Skipped (Disabled via config)", "service", s.Name())
	}
}
