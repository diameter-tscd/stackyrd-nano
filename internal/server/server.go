package server

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"stackyrd-nano/config"
	"stackyrd-nano/pkg/infrastructure"
	"stackyrd-nano/pkg/logger"
	"stackyrd-nano/pkg/registry"
	"stackyrd-nano/pkg/response"

	"github.com/gin-gonic/gin"
)

type Server struct {
	gin          *gin.Engine
	config       *config.Config
	logger       *logger.Logger
	dependencies *registry.Dependencies
}

func New(cfg *config.Config, l *logger.Logger) *Server {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// Custom error handler
	r.NoRoute(func(c *gin.Context) {
		l.Warn("Endpoint not found", "path", c.Request.URL.Path, "method", c.Request.Method)
		response.Error(c, http.StatusNotFound, "ENDPOINT_NOT_FOUND", "Endpoint not found. This incident will be reported.", map[string]interface{}{
			"path":   c.Request.URL.Path,
			"method": c.Request.Method,
		})
	})

	r.NoMethod(func(c *gin.Context) {
		l.Warn("Method not allowed")
		response.Error(c, http.StatusMethodNotAllowed, "HTTP_ERROR", "Method not allowed")
	})

	return &Server{
		gin:    r,
		config: cfg,
		logger: l,
	}
}

func (s *Server) Start() error {
	// Create dynamic dependencies container
	s.dependencies = registry.NewDependencies()

	// Register core infrastructure components
	s.dependencies.Set("cron", infrastructure.NewCronManager())
	s.logger.Info("Registered infrastructure component", "name", "cron")

	s.registerHealthEndpoints()

	s.logger.Info("Booting Services...")
	serviceRegistry := registry.NewServiceRegistry(s.logger)

	services := registry.AutoDiscoverServices(s.config, s.logger, s.dependencies)
	for _, service := range services {
		serviceRegistry.Register(service)
	}

	if len(services) <= 0 {
		s.logger.Warn("No services registered!")
	}

	serviceRegistry.Boot(s.gin)
	s.logger.Info("All services boot successfully")

	port := s.config.Server.Port
	s.logger.Info("HTTP server starting immediately", "port", port, "env", s.config.App.Env)

	return s.gin.Run(":" + port)
}

func (s *Server) registerHealthEndpoints() {
	s.gin.GET("/health", func(c *gin.Context) {
		response.Success(c, map[string]interface{}{
			"status":       "ok",
			"server_ready": true,
		})
	})

	s.gin.GET("/health/infrastructure", func(c *gin.Context) {
		_, ok := s.dependencies.Get("cron")
		response.Success(c, map[string]interface{}{
			"cron": ok,
		})
	})

	s.gin.POST("/restart", func(c *gin.Context) {
		go func() {
			time.Sleep(500 * time.Millisecond)
			os.Exit(1)
		}()
		response.Success(c, map[string]string{"status": "restarting", "message": "Service is restarting..."})
	})
}

func (s *Server) Shutdown(ctx context.Context, logger *logger.Logger) error {
	logger.Info("Starting graceful shutdown of infrastructure...")

	go func() {
		time.Sleep(10 * time.Second)
		logger.Warn("Maximum shutdown time is 20s, force shutdown when timeout.")
		logger.Fatal("Graceful shutdown timed out, force shutdown.", nil)
		os.Exit(1)
	}()

	var shutdownErrors []error

	shutdownComponent := func(name string, closer interface{}) {
		if closer == nil {
			return
		}

		logger.Info("Shutting down " + name + "...")
		if c, ok := closer.(interface{ Close() error }); ok {
			if err := c.Close(); err != nil {
				shutdownErrors = append(shutdownErrors, fmt.Errorf("%s shutdown error: %w", name, err))
				logger.Error("Error shutting down "+name, err)
			} else {
				logger.Info(name + " shut down successfully")
			}
		}
	}

	// Dynamically shut down all registered components
	for name, component := range s.dependencies.GetAll() {
		shutdownComponent(name, component)
	}

	if len(shutdownErrors) > 0 {
		logger.Warn("Graceful shutdown completed with errors", "error_count", len(shutdownErrors))
		for _, err := range shutdownErrors {
			logger.Error("Shutdown error", err)
		}
		return fmt.Errorf("shutdown completed with %d errors", len(shutdownErrors))
	}

	logger.Info("Graceful shutdown completed successfully")
	return nil
}
