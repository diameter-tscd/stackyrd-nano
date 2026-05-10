package main

import (
	"context"
	"embed"
	"fmt"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stackyrd-nano/config"
	"stackyrd-nano/internal/server"
	"stackyrd-nano/pkg/infrastructure"
	"stackyrd-nano/pkg/logger"
	"stackyrd-nano/pkg/tui"
	"stackyrd-nano/pkg/utils"

	"github.com/spf13/viper"
)

//go:embed embed/*
var embeddedFS embed.FS

// Application constants
const (
	AppName                   = "stackyrd-nano"
	DefaultAppName            = ""
	DefaultVersion            = "1.0.0"
	DefaultEnv                = "development"
	DefaultServerPort         = "8080"
	DefaultMonitoringPort     = "8081"
	DefaultStartupDelay       = 15
	ServiceConfigName         = "Configuration"
	ServiceCronName           = "Cron Scheduler"
	ColorPurple               = "\033[35m"
	ColorReset                = "\033[0m"
	ColorYellow               = "\033[33m"
	ErrInvalidConfigURLFormat = "invalid config URL format"
	ErrPortError              = "port error"
	ErrStepFailed             = "step failed"
	ConfigKeyWebFolder        = "web"
	StartupDelay              = 500 * time.Millisecond
	ShutdownDelay             = 100 * time.Millisecond
	PortCheckTimeout          = 5 * time.Second
	GracefulShutdownTimeout   = 30 * time.Second
	LogLevelDebug             = "debug"
	LogLevelInfo              = "info"
	LogLevelWarn              = "warn"
	LogLevelError             = "error"
	LogLevelFatal             = "fatal"
	MinStartupDelay           = 0
	MaxStartupDelay           = 300
	MinPortNumber             = 1
	MaxPortNumber             = 65535
)

// Types
type ServiceInit struct {
	Name     string
	Enabled  bool
	InitFunc func() error
}
type ServiceConfig struct {
	Name    string
	Enabled bool
}
type AppContext struct {
	Timestamp string
	ConfigURL string
}
type AppStep struct {
	Name string
	Fn   func(*AppContext) error
}
type OutputMode int

const (
	OutputModeTUI OutputMode = iota
	OutputModeConsole
)

func (m OutputMode) String() string {
	switch m {
	case OutputModeTUI:
		return "TUI"
	case OutputModeConsole:
		return "Console"
	default:
		return "Unknown"
	}
}

type ServiceStatus int

const (
	ServiceStatusEnabled ServiceStatus = iota
	ServiceStatusDisabled
	ServiceStatusSkipped
)

func (s ServiceStatus) String() string {
	switch s {
	case ServiceStatusEnabled:
		return "enabled"
	case ServiceStatusDisabled:
		return "disabled"
	case ServiceStatusSkipped:
		return "skipped"
	default:
		return "unknown"
	}
}

// ConfigManager handles configuration loading
type ConfigManager struct{ configURL string }

func NewConfigManager(configURL string) *ConfigManager { return &ConfigManager{configURL: configURL} }

func (cm *ConfigManager) LoadConfig() (*config.Config, error) {
	if cm.configURL != "" {
		return cm.loadConfigFromURL(cm.configURL)
	}
	return config.LoadConfig()
}

func (cm *ConfigManager) loadConfigFromURL(configURL string) (*config.Config, error) {
	if _, err := url.ParseRequestURI(configURL); err != nil {
		return nil, fmt.Errorf("%s: %w", ErrInvalidConfigURLFormat, err)
	}
	if err := utils.LoadConfigFromURL(configURL); err != nil {
		return nil, fmt.Errorf("failed to load config from URL: %w", err)
	}
	return config.LoadConfigWithURL(configURL)
}

func (cm *ConfigManager) ValidateConfig(cfg *config.Config) error {
	return utils.CheckPortAvailability(cfg.Server.Port)
}

func (cm *ConfigManager) LoadBanner(cfg *config.Config) (string, error) {
	if !infrastructure.Exists("banner") {
		return "", nil
	}
	banner, err := infrastructure.Read("banner")
	if err != nil {
		return "", nil
	}
	return string(banner), nil
}

func (cm *ConfigManager) GetServiceConfigs(cfg *config.Config) []ServiceConfig {
	return []ServiceConfig{{Name: ServiceCronName, Enabled: cfg.Cron.Enabled}}
}

func (cm *ConfigManager) CreateServiceQueue(cfg *config.Config) []ServiceInit {
	initQueue := []ServiceInit{{Name: ServiceConfigName, Enabled: true, InitFunc: nil}}
	for _, svc := range cm.GetServiceConfigs(cfg) {
		initQueue = append(initQueue, ServiceInit{Name: svc.Name, Enabled: svc.Enabled, InitFunc: nil})
	}
	for name, enabled := range cfg.Services {
		initQueue = append(initQueue, ServiceInit{Name: "Service: " + name, Enabled: enabled, InitFunc: nil})
	}
	return initQueue
}

// Application represents main application
type Application struct {
	configManager *ConfigManager
	config        *config.Config
	logger        *logger.Logger
	bannerText    string
}

func NewApplication(configManager *ConfigManager) *Application {
	return &Application{configManager: configManager}
}

func main() {
	flags := parseFlags()
	isDev := os.Getenv("APP_ENV") != "production"
	infrastructure.Init(embeddedFS, map[string]string{"config": "embed/config.yaml", "banner": "embed/banner.txt"}, isDev)

	file, err := embeddedFS.Open("embed/config.yaml")
	if err != nil {
		fmt.Printf("Fatal error config FS: %v \n", err)
		os.Exit(1)
	}
	defer file.Close()

	viper.SetConfigType("yaml")
	if err := viper.ReadConfig(file); err != nil {
		fmt.Printf("Fatal error config read: %v \n", err)
		os.Exit(1)
	}

	app := NewApplication(NewConfigManager(flags.ConfigURL))
	if err := app.Run(); err != nil {
		fmt.Printf("Fatal error: %v \n", err)
		os.Exit(1)
	}
}

func parseFlags() *utils.ParsedFlags {
	flagDefinitions := []utils.FlagDefinition{
		{Name: "c", DefaultValue: "", Description: "URL to load configuration from (YAML format)",
			Validator: func(value interface{}) error {
				if urlStr, ok := value.(string); ok && urlStr != "" {
					if _, err := url.ParseRequestURI(urlStr); err != nil {
						return fmt.Errorf("invalid config URL format: %w", err)
					}
				}
				return nil
			}},
		{Name: "port", DefaultValue: "", Description: "Server port (overrides config)"},
		{Name: "verbose", DefaultValue: false, Description: "Enable verbose logging"},
		{Name: "env", DefaultValue: "", Description: "Environment (development/staging/production)"},
	}

	flags, err := utils.ParseFlags(flagDefinitions)
	if err != nil {
		fmt.Printf("Error parsing flags: %v \n", err)
		utils.PrintUsage(flagDefinitions, AppName)
		os.Exit(1)
	}
	return flags
}

// Run executes application lifecycle
func (app *Application) Run() error {
	utils.ClearScreen()

	ctx := &AppContext{Timestamp: time.Now().Format("20060102_150405"), ConfigURL: app.configManager.configURL}
	steps := []AppStep{
		{"Loading configuration", app.loadConfigStep},
		{"Validating configuration", app.validateConfigStep},
		{"Loading banner", app.loadBannerStep},
		{"Checking port availability", app.checkPortStep},
		{"Initializing logger", app.initLoggerStep},
		{"Starting application", app.startAppStep},
	}

	for i, step := range steps {
		fmt.Printf("[%d/%d] %s \n", i+1, len(steps), step.Name)
		if err := step.Fn(ctx); err != nil {
			return fmt.Errorf("%s: %w", ErrStepFailed, err)
		}
	}
	return nil
}

// Step functions
func (app *Application) loadConfigStep(ctx *AppContext) error {
	cfg, err := app.configManager.LoadConfig()
	app.config = cfg
	return err
}
func (app *Application) validateConfigStep(ctx *AppContext) error {
	return app.configManager.ValidateConfig(app.config)
}
func (app *Application) loadBannerStep(ctx *AppContext) error {
	t, err := app.configManager.LoadBanner(app.config)
	app.bannerText = t
	return err
}
func (app *Application) checkPortStep(ctx *AppContext) error {
	return utils.CheckPortAvailability(app.config.Server.Port)
}

func (app *Application) initLoggerStep(ctx *AppContext) error {
	if app.config.App.EnableTUI {
		return nil
	}
	app.logger = logger.New(app.config.App.Debug, nil)
	app.logger.Info("Starting Application", "name", app.config.App.Name, "env", app.config.App.Env)
	app.logger.Info("TUI mode disabled, using traditional console logging")
	app.logger.Info("Initializing services...")
	return nil
}

func (app *Application) startAppStep(ctx *AppContext) error {
	utils.ClearScreen()
	if app.config.App.EnableTUI {
		app.runWithTUI()
	} else {
		app.runWithConsole()
	}
	return nil
}

func (app *Application) runWithTUI() {
	if !app.config.Monitoring.Enabled {
		app.config.Monitoring.Port = "disabled"
	}
	tuiConfig := tui.StartupConfig{
		AppName: app.config.App.Name, AppVersion: app.config.App.Version, Banner: app.bannerText,
		Port: app.config.Server.Port, MonitorPort: app.config.Monitoring.Port, Env: app.config.App.Env, IdleSeconds: app.config.App.StartupDelay,
	}
	initQueue := app.configManager.CreateServiceQueue(app.config)
	tuiInitQueue := make([]tui.ServiceInit, len(initQueue))
	for i, svc := range initQueue {
		tuiInitQueue[i] = tui.ServiceInit{Name: svc.Name, Enabled: svc.Enabled, InitFunc: svc.InitFunc}
	}
	_, _ = tui.RunBootSequence(tuiConfig, tuiInitQueue)
	liveTUI := tui.NewLiveTUI(tui.LiveConfig{
		AppName: app.config.App.Name, AppVersion: app.config.App.Version, Banner: app.bannerText,
		Port: app.config.Server.Port, MonitorPort: app.config.Monitoring.Port, Env: app.config.App.Env, OnShutdown: utils.TriggerShutdown,
	})
	liveTUI.Start()
	app.logger = logger.NewQuiet(app.config.App.Debug, liveTUI)
	liveTUI.AddLog(LogLevelInfo, "Server starting on port "+app.config.Server.Port)
	liveTUI.AddLog(LogLevelInfo, "Environment: "+app.config.App.Env)
	srv := server.New(app.config, app.logger)
	go func() {
		liveTUI.AddLog(LogLevelInfo, "HTTP server listening...")
		if err := srv.Start(); err != nil {
			liveTUI.AddLog(LogLevelFatal, "Server error: "+err.Error())
		}
	}()
	time.Sleep(StartupDelay)
	liveTUI.AddLog(LogLevelInfo, "Server ready at http://localhost:"+app.config.Server.Port)
	app.handleShutdown(liveTUI, srv)
}

func (app *Application) runWithConsole() {
	if app.bannerText != "" {
		fmt.Print(ColorPurple)
		fmt.Println(app.bannerText)
		fmt.Print(ColorReset)
	}
	app.logger = logger.New(app.config.App.Debug, nil)
	app.logger.Info("Starting Application", "name", app.config.App.Name, "env", app.config.App.Env)
	app.logger.Info("TUI mode disabled, using traditional console logging")
	app.logger.Info("Initializing services...")
	app.logAllServices()
	srv := server.New(app.config, app.logger)
	go func() {
		app.logger.Info("HTTP server listening", "port", app.config.Server.Port)
		if err := srv.Start(); err != nil {
			app.logger.Fatal("Server error", err)
		}
	}()
	time.Sleep(StartupDelay)
	app.logger.Info("Server ready", "url", "http://localhost:"+app.config.Server.Port)
	app.handleConsoleShutdown(srv)
}

func (app *Application) handleShutdown(liveTUI *tui.LiveTUI, srv *server.Server) {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-sigChan:
		liveTUI.AddLog(LogLevelWarn, "Shutting down...")
	case <-utils.ShutdownChan:
		liveTUI.AddLog(LogLevelWarn, "Shutting down...")
	}
	srv.Shutdown(context.Background(), app.logger)
	liveTUI.Stop()
	time.Sleep(ShutdownDelay)
	os.Exit(0)
}

func (app *Application) handleConsoleShutdown(srv *server.Server) {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	app.logger.Warn("Shutting down...")
	srv.Shutdown(context.Background(), app.logger)
	time.Sleep(ShutdownDelay)
	os.Exit(0)
}

func (app *Application) logAllServices() {
	for _, svc := range app.configManager.GetServiceConfigs(app.config) {
		app.logServiceStatus(svc.Name, svc.Enabled)
	}
	for name, enabled := range app.config.Services {
		app.logServiceStatus("Service: "+name, enabled)
	}
}

func (app *Application) logServiceStatus(name string, enabled bool) {
	if enabled {
		app.logger.Info("Service initialized", "service", name, "status", ServiceStatusEnabled.String())
	} else {
		app.logger.Debug("Service skipped", "service", name, "status", ServiceStatusDisabled.String())
	}
}
