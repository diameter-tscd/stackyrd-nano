# AGENTS.md — stackyrd-nano

This file captures everything an AI agent (or human contributor) needs to be effective in this repository.

---

## 1. Project Overview

`stackyrd-nano` is a Go (1.21+) service-fabric foundation for building distributed systems.
It provides a modular HTTP server, embedded TUI dashboard, cron scheduler, structured logging,
and a service-registry / dependency-injection system — all bootstrapped from a single entry point
at `cmd/app/main.go`.

**License:** Apache 2.0  
**Maintainer:** diameter-tscd <https://github.com/diameter-tscd/stackyrd-nano>

---

## 2. Build & Test Commands

These are the canonical commands. Run them before submitting or after making changes.

```bash
# Install dependencies
go mod download

# Build the application binary
go run scripts/build/build.go

# Run the app directly (development)
go run cmd/app/main.go

# Run all tests
go test ./...

# Run tests verbosely
go test -v ./...

# Run tests and generate coverage
go test -v -cover ./...

# Lint (run inside container; see CI workflow for tool list)
staticcheck ./...
go-critic check ./...
```

**CI uses:** Go 1.25.5. Build step runs `go build -v ./cmd/app/`, test step runs `go test -v ./...`.
Security scan runs: `gosec`, `nancy`, `govulncheck`, `trivy`, `staticcheck`, `go-critic`.

---

## 3. Repository Structure

```
stackyrd-nano/
├── cmd/app/              # Single entry point: main.go
│   └── embed/            # Embedded assets (config.yaml, banner.txt)
├── internal/
│   ├── server/           # HTTP server bootstrap (gin + service registry)
│   ├── middleware/        # (empty — hook for auth, CORS, rate-limit middleware)
│   └── services/         # (empty stubs — concrete service implementations go here)
│       └── modules/      # (empty)
├── pkg/                  # Public/shared packages
│   ├── interfaces/       # Service interface definition
│   ├── registry/         # Service auto-discovery registry + DI container
│   ├── infrastructure/   # Cron, Afero filesystem, component lifecycle
│   ├── logger/           # zerolog-based colorized structured logger
│   ├── response/         # Standardized JSON API responses + pagination
│   ├── request/          # Request binding + validation helpers
│   ├── tui/              # Bubble Tea TUI (boot screen, live logs, dashboard)
│   └── utils/            # General-purpose utilities (system, date, string, etc.)
├── config/               # Runtime config loaded via viper
│   └── config.go         # Config struct + LoadConfigWithURL()
├── scripts/
│   └── build/
│       └── build.go      # Go-based build tool (backup + compile + garble support)
├── tests/
│   ├── infrastructure/   # Table-driven tests for Afero filesystem
│   └── services/         # (empty)
├── docs_wiki/
│   └── blueprint/
│       └── blueprint.txt # Internal architecture doc
├── .github/workflows/    # go-build.yml, security.yml
├── go.mod / go.sum
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── DISTRIBUTION_STRUCTURE.md
```

---

## 4. Architecture & Patterns

### 4.1 Service Registry (Factory + `init()` Self-Registration)

Every service registers itself via `init()`:

```go
// In package internal/services/mymodule
func init() {
    registry.RegisterService("myservice", NewMyService)
}
```

The factory signature is:
```go
type ServiceFactory func(cfg *config.Config, logger *logger.Logger, deps *registry.Dependencies) interfaces.Service
```

The service interface:
```go
type Service interface {
    Name() string
    WireName() string
    Enabled() bool
    Endpoints() []string
    RegisterRoutes(g *gin.RouterGroup)
    Get() interface{}
}
```

All registered routes are automatically mounted under `/api/v1` by `server.Start()`.

### 4.2 Dependency Injection via `registry.Dependencies`

```go
// Store (typically in server.go):
deps.Set("mycomponent", componentInstance)

// Retrieve (in a service):
comp, ok := registry.GetTyped[*MyType](deps, "mycomponent")
```

Retrieval uses Go 1.18+ generics — `GetTyped[T]` returns typed values with an ok-bool.

### 4.3 Infrastructure Components

Infrastructure (cross-cutting) services implement:
```go
type InfrastructureComponent interface {
    Name() string
    Close() error
    GetStatus() map[string]interface{}
}
```

They are registered via `infrastructure.RegisterComponent(name, factory)` and initialized
together in `server.Start()` before services are booted. The built-in component is `cron`.

### 4.4 Configuration (viper)

`ConfigManager` loads from three sources, in priority order:
1. Remote URL (if `config_url` is set in env/flags)
2. `./config/config.yaml` (in dev, via Afero CopyOnWriteFs)
3. Embedded `embed/config.yaml`

Environment variables override config keys using dot-to-underscore conversion:
e.g. `SERVER_PORT` overrides `server.port`.

### 4.5 Two Output Modes

| Mode            | Receiver          | Broker Signal Callback |
|-----------------|-------------------|------------------------|
| `OutputModeTUI`  | `pkg/tui` Bubble Tea | LiveModel broadcasts to TUI log feed |
| `OutputModeConsole` | direct `fmt` / zerolog    | File or stdout output         |

Set via `app.enable_tui` in config.

### 4.6 No ORM, No Auth

As of this snapshot, DB connections (Postgres, Mongo, Redis, Kafka, MinIO, Grafana)
are declared in the config struct but service implementations are not yet wired.
`auth.type` is `"none"` by default — there is no auth middleware.
`internal/middleware/` and `internal/services/modules/` are empty stubs.

---

## 5. Key Files Reference

| File                | What it does |
|---------------------|-------------|
| `cmd/app/main.go`   | Entry point, lifecycle steps, TUI vs console branching, signal handling |
| `config/config.go`  | Config struct, default values, multi-DB normalization, environment overrides |
| `internal/server/server.go` | Gin engine bootstrap, health endpoints, registry wiring, graceful shutdown |
| `pkg/interfaces/service.go` | Service interface definition |
| `pkg/registry/registry.go` | Service factory registration + auto-discovery |
| `pkg/registry/dependencies.go` | Typed DI container |
| `pkg/registry/service_helper.go` | Helper for registration-time dependency checks |
| `pkg/infrastructure/cron_manager.go` | Full cron implementation (robfig/cron + worker pool) |
| `pkg/infrastructure/afero.go` | Singleton embed + OS filesystem manager |
| `pkg/logger/logger.go` | Colored zerolog wrapper |
| `pkg/response/response.go` | Standard API response + error helpers + pagination |
| `pkg/request/request.go` | Request binding, validation, reusable request structs |
| `pkg/tui/boot.go`    | Animated boot screen (bubbletea) |
| `pkg/tui/live.go`    | Live log viewer TUI |
| `pkg/tui/dashboard.go` | System metrics dashboard |
| `pkg/tui/styles.go`  | Lipgloss color palette and UI primitives |
| `pkg/tui/template/dialog.go` | Reusable confirmation / input dialogs |
| `scripts/build/build.go` | Native Go build tool (replaces `go build` directly) |

---

## 6. Code Style

- Target Go 1.25.x (per `go.mod`).
- Follow standard Go conventions — no special flavor enforced.
- Use `//go:embed` for files that need to be compiled into the binary.
- Prefer `*gin.Context` for HTTP, `*zerolog.Logger` for logging, `viper` for config.
- New files go under `pkg/` if shared across packages, `internal/` otherwise.
- Router groups are always mounted under `/api/v1`.
- Error responses should use `response.Error()` / `response.InternalServerError()` etc.,
  never raw `gin.H` error maps.

---

## 7. Adding a New Service Module

To add a new service (e.g. `orders`):

1. Create `internal/services/orders/orders.go`.
2. Define the struct and implement `interfaces.Service`.
3. In an `init()` function, register it:
   ```go
   func init() {
       registry.RegisterService("orders", NewOrdersService)
   }
   ```
4. In `config/config.go` add an `Orders OrdersConfig` field and a `viper.SetDefault` entry.
5. Call `deps.GetTyped[*MyDB](..., "postgres")` to declare its DB dependency.
6. Add a table-driven test file `internal/services/orders/orders_test.go`.

---

## 8. Common Edit Targets

| Intent                            | File(s)                        |
|-----------------------------------|-------------------------------|
| Add a config key / change defaults | `config/config.go`            |
| Add a health / management endpoint | `internal/server/server.go`   |
| Add a shared utility function     | `pkg/utils/`                  |
| Add a TUI component or style      | `pkg/tui/`                    |
| Add cron schedule config default  | `pkg/infrastructure/cron_manager.go` + `config/config.go` |
| Add middleware                    | `internal/middleware/` (new)  |

---

## 9. What NOT to Do

- Do not bypass the service registry — do not call `gin.HandleFunc()` directly in `server.go`.
- Do not hardcode port numbers or service names; use config fields.
- Do not commit secrets, tokens, certificates, `.env` files, or test credentials.
- Do not modify `internal/` packages to export them — move code to `pkg/` instead.
- Do not skip `go test ./...` before marking work done.
- Do not add third-party libraries without checking `go.mod` first for existing equivalents.
- Do not assume Drizzle ORM is present — it is not; use the `Dependencies` container or plain Go.

---

## 10. CI Workflows

### Go Build (`.github/workflows/go-build.yml`)

| Field | Value |
|---|---|
| **Runner** | `ubuntu-slim` |
| **Go version** | `1.25.3` |
| **Triggers** | push to `main` / `master` |

**Steps in order:**

1. `actions/checkout@v6`
2. `actions/setup-go@v6` — Go 1.25.3, module cache enabled
3. `actions/cache@v4` — caches `~/.cache/go-build` keyed by SHA
4. `go mod init` / `go mod tidy` (guarded: only runs if `go.mod` is missing/present; continues-on-error)
5. `go build -v ./cmd/app/`
6. `go test -v ./...` (continues-on-error)

---

### Go Security Scan (`.github/workflows/security.yml`)

| Field | Value |
|---|---|
| **Runner** | `ubuntu-latest` |
| **Go version** | `1.25` |
| **Triggers** | daily cron `0 2 * * *`, manual dispatch, push to `main`/`master` |
| **Permissions** | `contents: write` (to auto-commit reports), `security-events: write` |

**Tool chain, in order:**

| Step | Tool | Output | Notes |
|---|---|---|---|
| 1 | `actions/checkout@v6` | — | fetch-depth 0, persist-credentials |
| 2 | `actions/setup-go@v6` | — | Go 1.25 |
| 3 | `actions/cache@v4` | — | Go build cache |
| 4 | `go mod init` / `go mod tidy` | — | Guarded by `hashFiles('go.mod')` |
| 5 | `securego/gosec@master` | `gosec-results.sarif` | `-fmt sarif -out gosec-results.sarif ./...`; SARIF uploaded to CodeQL |
| 6 | `sonatype-nexus-community/nancy` (go install) | `nancy-report.json` | `go list -json -deps ./... \| nancy sleuth --output=json` |
| 7 | `golang.org/x/vuln/cmd/govulncheck` (go install) | `govulncheck-report.txt` | `govulncheck ./...` |
| 8 | `aquasecurity/trivy-action@master` | `trivy-results.sarif` | `scan-type: fs`, `severity: CRITICAL,HIGH`; SARIF uploaded to CodeQL |
| 9 | `honnef.co/go/tools/cmd/staticcheck` (go install) | stdout | `staticcheck ./...` |
| 10 | `github.com/go-critic/go-critic` (go install) | stdout | `gocritic check ./...` |

**Report lifecycle:**

- Aggregated into `.security-reports/scan_{success|alert}_{YYYYMMDD_HHMMSS}_{epoch}.md` (status = `alert` if CRITICAL/HIGH found in govulncheck or Nancy)
- SARIF artifacts saved alongside with timestamp names: `gosec_{timestamp}.sarif`, `trivy_{timestamp}.sarif`
- Refs older than 3 days are automatically deleted
- Results are **auto-committed and pushed** back to the branch by a dedicated step using `GITHUB_TOKEN`

---

## 11. Quick Reference

Go 1.25+ | `go run cmd/app/main.go` | `go run scripts/build/build.go` | `go test ./...` | Port 8080 default
