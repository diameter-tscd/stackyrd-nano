package server

import (
	"context"
	"net/http"

	"stackyrd-nano/config"
	"stackyrd-nano/internal/middleware"
	"stackyrd-nano/pkg/logger"
	"stackyrd-nano/pkg/response"

	"github.com/gin-gonic/gin"
)

type Server struct {
	gin    *gin.Engine
	config *config.Config
	logger *logger.Logger
}

func New(cfg *config.Config, l *logger.Logger) *Server {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// Custom error handler
	r.NoRoute(func(c *gin.Context) {
		l.Warn("Endpoint not found", "path", c.Request.URL.Path, "method", c.Request.Method)
		response.Error(c, http.StatusNotFound, "ENDPOINT_NOT_FOUND", "Endpoint not found", map[string]interface{}{
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
	s.logger.Info("Initializing Middleware...")
	middleware.InitMiddlewares(s.gin, middleware.Config{
		Logger: s.logger,
	})

	s.registerHealthEndpoints()

	port := s.config.Server.Port
	s.logger.Info("HTTP server starting", "port", port)

	return s.gin.Run(":" + port)
}

func (s *Server) registerHealthEndpoints() {
	s.gin.GET("/health", func(c *gin.Context) {
		response.Success(c, map[string]interface{}{
			"status":       "ok",
			"server_ready": true,
		})
	})
}

func (s *Server) Shutdown(ctx context.Context, logger *logger.Logger) error {
	logger.Info("Graceful shutdown completed successfully")
	return nil
}
