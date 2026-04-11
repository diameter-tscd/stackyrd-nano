package main

import (
	"embed"
	"fmt"
	"net/url"
	"os"

	"stackyrd-nano/pkg/infrastructure"
	"stackyrd-nano/pkg/utils"

	"github.com/spf13/viper"
)

//go:embed banner.txt config.yaml
var embeddedFS embed.FS

func main() {
	// Parse command line flags
	flags := parseFlags()

	// Initialize Afero embedded filesystem manager FIRST
	aliasMap := map[string]string{
		"config": "config.yaml",
		"banner": "banner.txt",
	}

	// Determine environment mode
	isDev := os.Getenv("APP_ENV") != "production"
	infrastructure.Init(embeddedFS, aliasMap, isDev)

	// Configure Viper to use Afero filesystem for config loading
	file, err := embeddedFS.Open("config.yaml")
	if err != nil {
		fmt.Printf("Fatal error config FS: %v\n", err)
		os.Exit(1)
	}
	defer file.Close()

	// Viper configuration
	viper.SetConfigType("yaml")
	if err := viper.ReadConfig(file); err != nil {
		fmt.Printf("Fatal error config read: %v\n", err)
		os.Exit(1)
	}

	// Create configuration manager
	configManager := NewConfigManager(flags.ConfigURL)

	// Create application with dependency injection
	app := NewApplication(configManager)

	// Run application with error handling
	if err := app.Run(); err != nil {
		fmt.Printf("Fatal error: %v\n", err)
		os.Exit(1)
	}
}

// parseFlags parses command line flags using the parameter utility
func parseFlags() *utils.ParsedFlags {
	// Define flag definitions
	flagDefinitions := []utils.FlagDefinition{
		{
			Name:         "c",
			DefaultValue: "",
			Description:  "URL to load configuration from (YAML format)",
			Validator: func(value interface{}) error {
				if urlStr, ok := value.(string); ok && urlStr != "" {
					if _, err := url.ParseRequestURI(urlStr); err != nil {
						return fmt.Errorf("invalid config URL format: %w", err)
					}
				}
				return nil
			},
		},
		{
			Name:         "port",
			DefaultValue: "",
			Description:  "Server port (overrides config)",
		},
		{
			Name:         "verbose",
			DefaultValue: false,
			Description:  "Enable verbose logging",
		},
		{
			Name:         "env",
			DefaultValue: "",
			Description:  "Environment (development/staging/production)",
		},
	}

	// Parse flags using the utility
	flags, err := utils.ParseFlags(flagDefinitions)
	if err != nil {
		fmt.Printf("Error parsing flags: %v\n", err)
		utils.PrintUsage(flagDefinitions, AppName)
		os.Exit(1)
	}

	return flags
}
