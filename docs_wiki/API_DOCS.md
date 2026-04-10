# API Documentation Guide

This guide covers how to automatically generate and maintain Swagger/OpenAPI documentation for stackyrd-nano-nano services using swaggo/swag. No manual YAML editing required—documentation is generated directly from your Go code annotations.

## Overview

stackyrd-nano-nano uses **swaggo/swag** to automatically generate Swagger documentation from code annotations. This approach ensures your API documentation stays synchronized with your actual code implementation.

### Benefits

- **Single Source of Truth**: Documentation lives alongside your code
- **Auto-Generation**: No manual YAML maintenance required
- **Always Up-to-Date**: Docs update when you update your code
- **Interactive UI**: Built-in Swagger UI for testing endpoints
- **Type Safety**: Leverages Go's type system for accurate documentation

## Installation

### Step 1: Install Swag CLI Tool

The swag CLI tool scans your Go code and generates documentation files:

```bash
# Install globally
go install github.com/swaggo/swag/cmd/swag@latest

# Verify installation
swag --version
```

### Step 2: Add Echo-Swagger Dependency

Add the echo-swagger middleware to serve the Swagger UI:

```bash
go get github.com/swaggo/echo-swagger
```

### Step 3: Verify Installation

```bash
# Check swag is in your PATH
which swag

# Test in your project
cd /path/to/stackyrd-nano-nano
swag init --help
```

## API-Level Documentation

### Main API Info

Create API-level metadata that appears at the top of your Swagger documentation. Add this to your `main.go` or create a dedicated `docs/docs.go` file:

```go
package main

// @title stackyrd-nano-nano API
// @version 1.0
// @description stackyrd-nano-nano API Documentation - A modular Go API framework
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.email admin@stackyrd-nano-nano.com

// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html

// @host localhost:8080
// @BasePath /api/v1

// @securityDefinitions.apikey ApiKeyAuth
// @in header
// @name Authorization

func main() {
    // Your application code
}
```

### Annotation Reference

| Annotation | Description | Example |
|------------|-------------|---------|
| `@title` | API title | `@title stackyrd-nano-nano API` |
| `@version` | API version | `@version 1.0` |
| `@description` | API description | `@description stackyrd-nano-nano API Documentation` |
| `@host` | Server host | `@host localhost:8080` |
| `@BasePath` | Base path for all endpoints | `@BasePath /api/v1` |
| `@contact.name` | Contact name | `@contact.name API Support` |
| `@contact.email` | Contact email | `@contact.email admin@stackyrd-nano-nano.com` |
| `@license.name` | License name | `@license.name Apache 2.0` |
| `@license.url` | License URL | `@license.url http://www.apache.org/licenses/LICENSE-2.0.html` |

## Endpoint Annotations

### Basic Annotations

Every endpoint handler should have annotations describing its behavior:

```go
// GetUsers godoc
// @Summary List users with pagination
// @Description Get a paginated list of users
// @Tags users
// @Accept json
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param per_page query int false "Items per page" default(10)
// @Success 200 {object} response.Response{data=[]User} "Success"
// @Failure 400 {object} response.Response "Bad request"
// @Router /users [get]
func (s *UsersService) GetUsers(c echo.Context) error {
    // Handler implementation
}
```

### Annotation Details

**@Summary**
- Brief description of what the endpoint does
- Appears as the endpoint title in Swagger UI
- Keep it concise (1 line)

```go
// @Summary List users with pagination
```

**@Description**
- Detailed explanation of the endpoint
- Can span multiple lines
- Explain business logic, constraints, or special behavior

```go
// @Description Get a paginated list of users with optional filtering.
// @Description Supports search by name and email.
// @Description Results are sorted by creation date descending.
```

**@Tags**
- Groups related endpoints together
- Used for organizing documentation by feature/domain
- Multiple tags can be specified

```go
// @Tags users
// @Tags admin
```

**@Accept** and **@Produce**
- Specify content types the endpoint accepts and returns
- Common values: `json`, `xml`, `plain`, `multipart/form-data`

```go
// @Accept json
// @Produce json
```

**@Router**
- Defines the URL path and HTTP method
- Path parameters use `{param}` syntax
- Must match the actual route registration

```go
// @Router /users [get]
// @Router /users/{id} [get]
// @Router /users [post]
// @Router /users/{id} [put]
// @Router /users/{id} [delete]
```

### Request Parameters

**Query Parameters**

```go
// @Param page query int false "Page number" default(1)
// @Param per_page query int false "Items per page" default(10)
// @Param search query string false "Search term"
// @Param status query string false "Filter by status" Enums(active,inactive,suspended)
```

Format: `@Param name location type required "description" [options]`

- `name`: Parameter name
- `location`: `query`, `path`, `header`, `formData`, `body`
- `type`: `string`, `int`, `bool`, `float`, or struct name
- `required`: `true` or `false`
- `description`: Human-readable description
- `options`: `default(value)`, `Enums(a,b,c)`, `minimum`, `maximum`

**Path Parameters**

```go
// @Param id path string true "User ID"
// @Param tenant path string true "Tenant identifier"
```

**Body Parameters**

```go
// @Param request body CreateUserRequest true "Create user request"
```

### Response Annotations

**Success Responses**

```go
// @Success 200 {object} User "User retrieved successfully"
// @Success 200 {object} response.Response{data=User} "Success"
// @Success 200 {object} response.Response{data=[]User} "List of users"
// @Success 201 {object} response.Response{data=User} "Created"
// @Success 204 "No content"
```

**Error Responses**

```go
// @Failure 400 {object} response.Response "Bad request"
// @Failure 401 {object} response.Response "Unauthorized"
// @Failure 403 {object} response.Response "Forbidden"
// @Failure 404 {object} response.Response "Not found"
// @Failure 422 {object} response.Response "Validation error"
// @Failure 500 {object} response.Response "Internal server error"
```

## Model Documentation

### Documenting Structs

Add comments to your struct definitions to document them in Swagger:

```go
// User represents a user in the system
type User struct {
    ID        string `json:"id" example:"usr_123" description:"Unique user identifier"`
    Username  string `json:"username" example:"john_doe" description:"User's login name"`
    Email     string `json:"email" example:"john@example.com" description:"User's email address"`
    Status    string `json:"status" example:"active" description:"Account status" enums:"active,inactive,suspended"`
    CreatedAt int64  `json:"created_at" example:"1640995200" description:"Unix timestamp of account creation"`
}
```

### Struct Tags for Swagger

| Tag | Description | Example |
|-----|-------------|---------|
| `json` | JSON field name | `json:"username"` |
| `example` | Example value | `example:"john_doe"` |
| `description` | Field description | `description:"User's login name"` |
| `enums` | Allowed values | `enums:"active,inactive"` |
| `default` | Default value | `default:"active"` |
| `binding` | Validation rules | `binding:"required"` |
| `minimum` | Minimum value | `minimum:"0"` |
| `maximum` | Maximum value | `maximum:"100"` |
| `minlength` | Minimum length | `minlength:"3"` |
| `maxlength` | Maximum length | `maxlength:"50"` |

### Request/Response Structs

Document your request and response structs:

```go
// CreateUserRequest represents the request body for creating a new user
type CreateUserRequest struct {
    Username string `json:"username" validate:"required,username" example:"john_doe" description:"Unique username (3-20 alphanumeric characters)"`
    Email    string `json:"email" validate:"required,email" example:"john@example.com" description:"Valid email address"`
    FullName string `json:"full_name" validate:"required,min=3,max=100" example:"John Doe" description:"User's full name"`
}

// UpdateUserRequest represents the request body for updating an existing user
type UpdateUserRequest struct {
    Username string `json:"username" validate:"omitempty,username" example:"john_updated" description:"New username"`
    Email    string `json:"email" validate:"omitempty,email" example:"john.new@example.com" description:"New email address"`
    FullName string `json:"full_name" validate:"omitempty,min=3,max=100" example:"John Updated Doe" description:"New full name"`
    Status   string `json:"status" validate:"omitempty,oneof=active inactive suspended" example:"active" description:"Account status" enums:"active,inactive,suspended"`
}
```

### Response Wrapper Structs

Document the standard response format:

```go
// Response represents the standard API response structure
type Response struct {
    Success       bool        `json:"success" example:"true" description:"Indicates if the request was successful"`
    Status        int         `json:"status" example:"200" description:"HTTP status code"`
    Message       string      `json:"message" description:"Human-readable response message"`
    Data          interface{} `json:"data,omitempty" description:"Response data payload"`
    Error         interface{} `json:"error,omitempty" description:"Error details if request failed"`
    Meta          *Meta       `json:"meta,omitempty" description:"Pagination metadata"`
    Timestamp     int64       `json:"timestamp" example:"1640995200" description:"Unix timestamp of response"`
    Datetime      string      `json:"datetime" example:"2022-01-01T00:00:00Z" description:"ISO 8601 datetime of response"`
    CorrelationID string      `json:"correlation_id" example:"550e8400-e29b-41d4-a716-446655440000" description:"Request correlation ID for tracing"`
}

// Meta represents pagination metadata
type Meta struct {
    Page       int   `json:"page" example:"1" description:"Current page number"`
    PerPage    int   `json:"per_page" example:"10" description:"Items per page"`
    Total      int64 `json:"total" example:"100" description:"Total number of items"`
    TotalPages int   `json:"total_pages" example:"10" description:"Total number of pages"`
}
```

## Complete Service Examples

### Users Service (Complete Example)

```go
package modules

import (
    "stackyrd-nano-nano/config"
    "stackyrd-nano-nano/pkg/interfaces"
    "stackyrd-nano-nano/pkg/logger"
    "stackyrd-nano-nano/pkg/registry"
    "stackyrd-nano-nano/pkg/request"
    "stackyrd-nano-nano/pkg/response"
    "time"

    "github.com/labstack/echo/v4"
)

type UsersService struct {
    enabled bool
}

func NewUsersService(enabled bool) *UsersService {
    return &UsersService{enabled: enabled}
}

func (s *UsersService) Name() string        { return "Users Service" }
func (s *UsersService) WireName() string    { return "users-service" }
func (s *UsersService) Enabled() bool       { return s.enabled }
func (s *UsersService) Endpoints() []string { return []string{"/users", "/users/:id"} }
func (s *UsersService) Get() interface{}    { return s }

func (s *UsersService) RegisterRoutes(g *echo.Group) {
    sub := g.Group("/users")

    sub.GET("", s.GetUsers)
    sub.GET("/:id", s.GetUser)
    sub.POST("", s.CreateUser)
    sub.PUT("/:id", s.UpdateUser)
    sub.DELETE("/:id", s.DeleteUser)
}

// User represents a user in the system
type User struct {
    ID        string `json:"id" example:"usr_123" description:"Unique user identifier"`
    Username  string `json:"username" example:"john_doe" description:"User's login name"`
    Email     string `json:"email" example:"john@example.com" description:"User's email address"`
    Status    string `json:"status" example:"active" description:"Account status"`
    CreatedAt int64  `json:"created_at" example:"1640995200" description:"Unix timestamp of account creation"`
}

// CreateUserRequest represents the request body for creating a new user
type CreateUserRequest struct {
    Username string `json:"username" validate:"required,username" example:"john_doe" description:"Unique username"`
    Email    string `json:"email" validate:"required,email" example:"john@example.com" description:"Valid email address"`
    FullName string `json:"full_name" validate:"required,min=3,max=100" example:"John Doe" description:"User's full name"`
}

// UpdateUserRequest represents the request body for updating a user
type UpdateUserRequest struct {
    Username string `json:"username" validate:"omitempty,username" example:"john_updated" description:"New username"`
    Email    string `json:"email" validate:"omitempty,email" example:"john.new@example.com" description:"New email"`
    FullName string `json:"full_name" validate:"omitempty,min=3,max=100" example:"John Updated Doe" description:"New full name"`
    Status   string `json:"status" validate:"omitempty,oneof=active inactive suspended" example:"active" description:"Account status"`
}

// GetUsers godoc
// @Summary List users with pagination
// @Description Get a paginated list of users
// @Tags users
// @Accept json
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param per_page query int false "Items per page" default(10)
// @Success 200 {object} response.Response{data=[]User} "Success"
// @Failure 400 {object} response.Response "Bad request"
// @Router /users [get]
func (s *UsersService) GetUsers(c echo.Context) error {
    var pagination response.PaginationRequest
    if err := c.Bind(&pagination); err != nil {
        return response.BadRequest(c, "Invalid pagination parameters")
    }

    users := []User{
        {ID: "1", Username: "john_doe", Email: "john@example.com", Status: "active", CreatedAt: time.Now().Unix()},
        {ID: "2", Username: "jane_smith", Email: "jane@example.com", Status: "active", CreatedAt: time.Now().Unix()},
    }

    total := int64(len(users))
    meta := response.CalculateMeta(pagination.GetPage(), pagination.GetPerPage(), total)
    return response.SuccessWithMeta(c, users, meta, "Users retrieved successfully")
}

// GetUser godoc
// @Summary Get single user
// @Description Get a specific user by ID
// @Tags users
// @Accept json
// @Produce json
// @Param id path string true "User ID"
// @Success 200 {object} response.Response{data=User} "Success"
// @Failure 404 {object} response.Response "Not found"
// @Router /users/{id} [get]
func (s *UsersService) GetUser(c echo.Context) error {
    id := c.Param("id")
    user := User{
        ID:        id,
        Username:  "john_doe",
        Email:     "john@example.com",
        Status:    "active",
        CreatedAt: time.Now().Unix(),
    }

    if id == "999" {
        return response.NotFound(c, "User not found")
    }

    return response.Success(c, user, "User retrieved successfully")
}

// CreateUser godoc
// @Summary Create user
// @Description Create a new user
// @Tags users
// @Accept json
// @Produce json
// @Param request body CreateUserRequest true "Create user request"
// @Success 201 {object} response.Response{data=User} "Created"
// @Failure 400 {object} response.Response "Bad request"
// @Failure 422 {object} response.Response "Validation error"
// @Router /users [post]
func (s *UsersService) CreateUser(c echo.Context) error {
    var req CreateUserRequest

    if err := request.Bind(c, &req); err != nil {
        if validationErr, ok := err.(*request.ValidationError); ok {
            return response.ValidationError(c, "Validation failed", validationErr.GetFieldErrors())
        }
        return response.BadRequest(c, err.Error())
    }

    user := User{
        ID:        "123",
        Username:  req.Username,
        Email:     req.Email,
        Status:    "active",
        CreatedAt: time.Now().Unix(),
    }

    return response.Created(c, user, "User created successfully")
}

// UpdateUser godoc
// @Summary Update user
// @Description Update an existing user
// @Tags users
// @Accept json
// @Produce json
// @Param id path string true "User ID"
// @Param request body UpdateUserRequest true "Update user request"
// @Success 200 {object} response.Response{data=User} "Success"
// @Failure 400 {object} response.Response "Bad request"
// @Failure 422 {object} response.Response "Validation error"
// @Router /users/{id} [put]
func (s *UsersService) UpdateUser(c echo.Context) error {
    id := c.Param("id")

    var req UpdateUserRequest
    if err := request.Bind(c, &req); err != nil {
        if validationErr, ok := err.(*request.ValidationError); ok {
            return response.ValidationError(c, "Validation failed", validationErr.GetFieldErrors())
        }
        return response.BadRequest(c, err.Error())
    }

    user := User{
        ID:        id,
        Username:  req.Username,
        Email:     req.Email,
        Status:    req.Status,
        CreatedAt: time.Now().Unix(),
    }

    return response.Success(c, user, "User updated successfully")
}

// DeleteUser godoc
// @Summary Delete user
// @Description Delete a user by ID
// @Tags users
// @Accept json
// @Produce json
// @Param id path string true "User ID"
// @Success 204 "No content"
// @Failure 404 {object} response.Response "Not found"
// @Router /users/{id} [delete]
func (s *UsersService) DeleteUser(c echo.Context) error {
    id := c.Param("id")

    if id == "999" {
        return response.NotFound(c, "User not found")
    }

    return response.NoContent(c)
}

func init() {
    registry.RegisterService("users_service", func(config *config.Config, logger *logger.Logger, deps *registry.Dependencies) interfaces.Service {
        return NewUsersService(config.Services.IsEnabled("users_service"))
    })
}
```

### Products Service (Simplified Example)

```go
package modules

import (
    "stackyrd-nano-nano/config"
    "stackyrd-nano-nano/pkg/interfaces"
    "stackyrd-nano-nano/pkg/logger"
    "stackyrd-nano-nano/pkg/registry"
    "stackyrd-nano-nano/pkg/response"

    "github.com/labstack/echo/v4"
)

const SERVICE_NAME = "products-service"

type ProductsService struct {
    enabled bool
}

func NewProductsService(enabled bool) *ProductsService {
    return &ProductsService{enabled: enabled}
}

func (s *ProductsService) Name() string        { return "Products Service" }
func (s *ProductsService) WireName() string    { return SERVICE_NAME }
func (s *ProductsService) Enabled() bool       { return s.enabled }
func (s *ProductsService) Endpoints() []string { return []string{"/products"} }
func (s *ProductsService) Get() interface{}    { return s }

// GetProducts godoc
// @Summary Get products
// @Description Get a list of products
// @Tags products
// @Accept json
// @Produce json
// @Success 200 {object} response.Response "Success"
// @Router /products [get]
func (s *ProductsService) RegisterRoutes(g *echo.Group) {
    sub := g.Group("/products")
    sub.GET("", func(c echo.Context) error {
        return response.Success(c, map[string]string{"message": "Hello from Products Service"})
    })
}

func init() {
    registry.RegisterService(SERVICE_NAME, func(config *config.Config, logger *logger.Logger, deps *registry.Dependencies) interfaces.Service {
        return NewProductsService(config.Services.IsEnabled(SERVICE_NAME))
    })
}
```

### Tasks Service (Database Example)

```go
// Tasks godoc
// @Summary List all tasks
// @Description Retrieve all tasks from the database
// @Tags tasks
// @Accept json
// @Produce json
// @Success 200 {object} response.Response{data=[]Task} "Success"
// @Failure 500 {object} response.Response "Internal server error"
// @Router /tasks [get]
func (s *TasksService) listTasks(c echo.Context) error {
    var tasks []Task
    result := s.db.GORMFindAsync(context.Background(), &tasks)
    _, err := result.Wait()
    if err != nil {
        return response.InternalServerError(c, err.Error())
    }
    return response.Success(c, tasks)
}

// CreateTask godoc
// @Summary Create a new task
// @Description Create a new task in the database
// @Tags tasks
// @Accept json
// @Produce json
// @Param request body Task true "Task to create"
// @Success 201 {object} response.Response{data=Task} "Created"
// @Failure 400 {object} response.Response "Bad request"
// @Failure 500 {object} response.Response "Internal server error"
// @Router /tasks [post]
func (s *TasksService) createTask(c echo.Context) error {
    task := new(Task)
    if err := c.Bind(task); err != nil {
        return response.BadRequest(c, "Invalid input")
    }
    result := s.db.GORMCreateAsync(context.Background(), task)
    _, err := result.Wait()
    if err != nil {
        return response.InternalServerError(c, err.Error())
    }
    return response.Created(c, task)
}
```

## Advanced Features

### Authentication Annotations

Document endpoints that require authentication:

```go
// @Security ApiKeyAuth
// @Security BearerAuth
// @Summary Get protected resource
// @Description This endpoint requires authentication
// @Tags protected
// @Accept json
// @Produce json
// @Success 200 {object} response.Response "Success"
// @Failure 401 {object} response.Response "Unauthorized"
// @Router /protected/resource [get]
```

Define security schemes in your main API info:

```go
// @securityDefinitions.apikey ApiKeyAuth
// @in header
// @name Authorization

// @securityDefinitions.bearer BearerAuth
// @in header
// @name Authorization
```

### Enum Values

Document allowed values for parameters:

```go
// @Param status query string false "Filter by status" Enums(active,inactive,suspended)
// @Param sort query string false "Sort field" Enums(name,created_at,updated_at)
// @Param order query string false "Sort order" Enums(asc,desc) default(desc)
```

### Default Values

Specify default values for optional parameters:

```go
// @Param page query int false "Page number" default(1)
// @Param per_page query int false "Items per page" default(10)
// @Param order query string false "Sort order" default(desc)
```

### File Uploads

Document file upload endpoints:

```go
// UploadFile godoc
// @Summary Upload a file
// @Description Upload a file to the server
// @Tags files
// @Accept multipart/form-data
// @Produce json
// @Param file formData file true "File to upload"
// @Param description formData string false "File description"
// @Success 201 {object} response.Response "File uploaded"
// @Failure 400 {object} response.Response "Bad request"
// @Router /files/upload [post]
func (s *FileService) uploadFile(c echo.Context) error {
    // Implementation
}
```

### Multiple Response Types

Document different response scenarios:

```go
// @Success 200 {object} User "User found"
// @Success 200 {object} UserList "Multiple users"
// @Failure 400 {object} response.Response "Bad request"
// @Failure 401 {object} response.Response "Unauthorized"
// @Failure 403 {object} response.Response "Forbidden"
// @Failure 404 {object} response.Response "Not found"
// @Failure 500 {object} response.Response "Internal server error"
```

## Generating Documentation

### stackyrd-nano-nano Swagger Generator (Recommended)

stackyrd-nano-nano includes a custom swagger generator script that follows the same pattern as the build system. This script provides detailed analysis of exposed endpoints before generation.

**One-Line Command:**

```bash
# Generate swagger documentation with detailed analysis
go run scripts/swagger/swagger.go

# Dry run (analysis only, no generation)
go run scripts/swagger/swagger.go --dry-run

# Verbose output
go run scripts/swagger/swagger.go --verbose
```

**Features:**

- **API Analysis**: Scans all service files and discovers endpoints, methods, and annotations
- **Detailed Reporting**: Shows service count, endpoint count, and struct count
- **Endpoint Discovery**: Lists all exposed API endpoints with methods and paths
- **Annotation Detection**: Identifies which services have swagger annotations
- **Automatic Installation**: Installs swag CLI if not found
- **User Confirmation**: Asks for confirmation before generation
- **Output Verification**: Verifies generated files exist

**Example Output:**

```
   /\ 
   (  )   Swagger Generator for stackyrd-nano-nano
    \/
----------------------------------------------------------------------
[1/6] Finding project root
[2/6] Checking swag CLI
[3/6] Analyzing API endpoints

 SWAGGER ANALYSIS RESULTS

Broadcast Service
  File: broadcast_service.go
  Annotations: Found
  Endpoints: 1
    •  get  /events/stream/{stream_id}
      Stream events from a specific stream

Cache Service
  File: cache_service.go
  Annotations: Found
  Endpoints: 2
    •  get  /cache/{key}
      Get cached value by key
    •  post  /cache/{key}
      Set cached value

Encryption Service
  File: encryption_service.go
  Annotations: Found
  Endpoints: 4
    •  post  /encryption/encrypt
      Encrypt data
    •  post  /encryption/decrypt
      Decrypt data
    •  get  /encryption/status
      Get encryption service status
    •  post  /encryption/key-rotate
      Rotate encryption key

 Total Services: 9
 Services with Annotations: 9
 Total Endpoints: 37
 Total Structs: 24

[4/6] Asking for confirmation
[5/6] Generating swagger docs
[6/6] Verifying output

 SUCCESS! Swagger docs at: /path/to/project/docs

 Generated files:
   • docs/docs.go
   • docs/swagger.json
   • docs/swagger.yaml
```

**Script Location:** `scripts/swagger/swagger.go`

**Command Line Options:**
- `--dry-run`: Only analyze, don't generate documentation
- `--verbose`: Enable verbose logging output
- `--help`: Show help information

### Basic Generation

Run the swag init command from your project root:

```bash
# Generate documentation from current directory
swag init

# Generate from specific directory
swag init -g cmd/app/main.go

# Specify output directory
swag init -o docs

# Generate with specific general API info
swag init -g cmd/app/main.go -o docs
```

### Output Files

Swag generates three files:

```
docs/
├── docs.go          # Go file containing embedded docs
├── swagger.json     # OpenAPI 2.0 specification (JSON)
└── swagger.yaml     # OpenAPI 2.0 specification (YAML)
```

### Generation Options

```bash
# Generate with specific output format
swag init --outputTypes go,json,yaml

# Generate only JSON
swag init --outputTypes json

# Generate with custom package name
swag init --packageName docs

# Parse specific directories
swag init --parseDependency --parseInternal

# Exclude vendor directory
swag init --exclude ./vendor

# Include markdown files
swag init --markdownFiles docs

# Enable verbose output
swag init --v
```

### Automatic Generation on Build

Add to your Makefile:

```makefile
.PHONY: docs
docs:
	swag init -g cmd/app/main.go -o docs

.PHONY: build
build: docs
	go build -o app cmd/app/main.go
```

Or create a build script:

```bash
#!/bin/bash
# scripts/build.sh

echo "Generating Swagger documentation..."
swag init -g cmd/app/main.go -o docs

echo "Building application..."
go build -ldflags="-w -s" -o app cmd/app/main.go

echo "Build complete!"
```

## Serving Swagger UI

### Add Swagger Route

Add the echo-swagger middleware to serve the Swagger UI. In your server setup:

```go
package server

import (
    "github.com/labstack/echo/v4"
    echoSwagger "github.com/swaggo/echo-swagger"
    
    // Import generated docs
    _ "stackyrd-nano-nano/docs"
)

func (s *Server) setupSwagger() {
    // Serve Swagger UI at /swagger/*
    s.echo.GET("/swagger/*", echoSwagger.EchoWrapHandler())
}
```

### Custom Swagger UI Options

```go
import (
    "github.com/swaggo/echo-swagger"
    swaggerFiles "github.com/swaggo/files"
)

func (s *Server) setupSwagger() {
    // Custom configuration
    config := &echoSwagger.Config{
        URL:                      "/swagger/doc.json",
        DocExpansion:             "list",
        DeepLinking:              true,
        DefaultModelsExpandDepth: 1,
    }
    
    s.echo.GET("/swagger/*", echoSwagger.EchoWrapHandler(config))
}
```

### Access Documentation

After starting your server:

1. Open your browser to `http://localhost:8080/swagger/index.html`
2. Browse available endpoints
3. Test endpoints directly from the UI
4. View request/response schemas

## Best Practices

### Annotation Conventions

1. **Be Descriptive**: Write clear summaries and descriptions
2. **Use Examples**: Include realistic example values
3. **Document All Responses**: Include both success and error cases
4. **Group by Tag**: Use tags to organize related endpoints
5. **Version Your API**: Include version in API info

### Code Organization

```go
// Keep annotations directly above the handler function
// GetUsers godoc
// @Summary List users with pagination
// @Description Get a paginated list of users
// @Tags users
// @Accept json
// @Produce json
// @Param page query int false "Page number" default(1)
// @Success 200 {object} response.Response{data=[]User} "Success"
// @Router /users [get]
func (s *UsersService) GetUsers(c echo.Context) error {
    // Implementation
}
```

### Struct Documentation

```go
// Always document request/response structs
// CreateUserRequest represents the request body for creating a user
type CreateUserRequest struct {
    // Document each field with example and description
    Username string `json:"username" example:"john_doe" description:"Unique username" validate:"required"`
    Email    string `json:"email" example:"john@example.com" description:"Valid email address" validate:"required,email"`
}
```

### Keeping Docs in Sync

1. **Update Annotations First**: When changing endpoints, update annotations before code
2. **Regenerate Regularly**: Run `swag init` before commits
3. **Add to CI/CD**: Auto-generate docs in your build pipeline
4. **Review Changes**: Check generated docs for accuracy

### CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
name: Generate Swagger Docs

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      
      - name: Install swag
        run: go install github.com/swaggo/swag/cmd/swag@latest
      
      - name: Generate docs
        run: swag init -g cmd/app/main.go -o docs
      
      - name: Verify docs
        run: |
          if [ -f "docs/swagger.json" ]; then
            echo "Swagger documentation generated successfully"
          else
            echo "Failed to generate documentation"
            exit 1
          fi
```

## Troubleshooting

### Common Issues

**Problem**: `swag: command not found`
```bash
# Solution: Add Go bin to PATH
export PATH=$PATH:$(go env GOPATH)/bin
# Or install again
go install github.com/swaggo/swag/cmd/swag@latest
```

**Problem**: Annotations not appearing in generated docs
```bash
# Solution: Ensure annotations are directly above the function
# Check for typos in annotation names
# Verify you're running swag from project root
swag init --v  # Enable verbose output
```

**Problem**: Struct fields not documented
```bash
# Solution: Add example and description tags to struct fields
type User struct {
    Name string `json:"name" example:"John" description:"User's name"`
}
```

**Problem**: Generated docs are outdated
```bash
# Solution: Run swag init before building
swag init -g cmd/app/main.go -o docs
go build cmd/app/main.go
```

**Problem**: Swagger UI not loading
```bash
# Solution: Verify echo-swagger is registered
# Check that docs package is imported: _ "yourproject/docs"
# Ensure route is registered: e.GET("/swagger/*", echoSwagger.EchoWrapHandler())
```

## Example Workflow

Complete workflow for adding a new documented endpoint:

```bash
# 1. Add handler with annotations
# Edit internal/services/modules/users_service.go

# 2. Generate documentation
cd /path/to/stackyrd-nano-nano
swag init -g cmd/app/main.go -o docs

# 3. Verify generated files
ls -la docs/

# 4. Build and run
go run cmd/app/main.go

# 5. Test in browser
open http://localhost:8080/swagger/index.html
```

## Migration from Manual Swagger

If migrating from a manual `swagger.yaml`:

1. **Add annotations** to all endpoint handlers
2. **Document structs** with example tags
3. **Run swag init** to generate new docs
4. **Compare output** with your manual YAML
5. **Update server** to use generated docs
6. **Remove manual YAML** when satisfied

```bash
# Generate new docs
swag init -o docs_new

# Compare with existing
diff docs/swagger.yaml docs_new/swagger.yaml

# Replace when ready
mv docs_new/* docs/
rm -rf docs_new
```

## Next Steps

Now that you understand API documentation with swag, explore:

- **[Development Guide](DEVELOPMENT.md)** - Learn to build services
- **[Architecture Overview](ARCHITECTURE.md)** - Understand the system design
- **[Getting Started](GETTING_STARTED.md)** - Set up your development environment