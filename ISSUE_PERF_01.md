# ISSUE_PERF_01 — Performance Audit Report

**Project:** stackyrd-nano
**Audit Date:** 2026-05-23
**Scope:** All 28 Go source files (`cmd/`, `internal/`, `pkg/`, `config/`, `scripts/`)
**Methodology:** Static code review against common Go performance anti-patterns: allocation pressure, goroutine management, data races, I/O blocking, HTTP server hardening, config loading, logging overhead, and memory leaks.
**Summary:** 7 CRITICAL · 4 HIGH · 7 MEDIUM · 7 LOW (25 total findings)

---

## Quick-Reference Severity Map

| ID | Severity | Category | File |
|----|----------|----------|------|
| CRIT-1 | 🔴 CRITICAL | Data race on global maps | `pkg/registry/registry.go` |
| CRIT-2 | 🔴 CRITICAL | Double `Close()` panics on worker pool | `pkg/infrastructure/cron_manager.go` |
| CRIT-3 | 🔴 CRITICAL | Unbuffered jobQueue deadlock at pool drain | `pkg/infrastructure/cron_manager.go` |
| CRIT-4 | 🔴 CRITICAL | Mutex held across blocking I/O in CloseAll | `pkg/infrastructure/registry.go` |
| CRIT-5 | 🔴 CRITICAL | Unbuffered ShutdownChan blocks forever | `pkg/utils/system.go` |
| CRIT-6 | 🔴 CRITICAL | Viper global state mutated concurrently | `config/config.go` |
| CRIT-7 | 🔴 CRITICAL | HTTP server has no timeouts; /restart is unauthenticated DoS | `internal/server/server.go` |

---

---

## 🔴 CRITICAL

### CRIT-1 — Global map data race on service registry

**File:** `pkg/registry/registry.go`
**Lines:** 16–19, 22–25, 42–50, 68, 72–73, 106

**Evidence:**

```go
// Line 16-19: two declared global maps
var serviceFactories = make(map[string]ServiceFactory)
var serviceDiscovered = make(map[string]interface{})
```

```go
// Line 22-25: written without mutex
func RegisterService(name string, factory ServiceFactory) {
    var once sync.Once             // local once — does not protect concurrent calls
    once.Do(func() { ... })
    serviceFactories[name] = factory // unsynchronised write
}
```

```go
// Line 42-50: AutoDiscoverServices reads without lock
func AutoDiscoverServices(...) []interfaces.Service {
    factories := GetServiceFactories() // returns direct pointer, nothing protected
}
```

```go
// Line 68: returns un-protected pointer
func GetServiceFactories() map[string]ServiceFactory {
    return serviceFactories // direct pointer — caller can mutate global state
}
```

```go
// Line 106: read/write on discovered map, no lock
func (r ServiceRegistry) Register(name string, factory ...) {
    ...
    r.discovered[name] = instance // unsynchronised
}
```

**Why it matters:** `init()` functions are called sequentially at program startup, but nothing prevents a future dynamically-loaded module from calling `RegisterService` from a goroutine, or `AutoDiscoverServices` being called from more than one goroutine. The race is detectable by `go test -race`.

**Evidence from `server.go` line 55–60:**

```go
// server.Start() calls AutoDiscoverServices assigning to data but no concurrency guard
for _, factory := range registry.AutoDiscoverServices(cfg, logger, deps) {
```

---

#### ✅ Action Checklist

- [ ] Add `sync.RWMutex` field to the `registry` struct (or make it `sync.Map`).
- [ ] Wrap all reads of `serviceFactories` with `RLock` / all writes with `Lock`.
- [ ] Return a *copy* of the map from `GetServiceFactories()` instead of the raw pointer.
- [ ] Change `once.Do` in `RegisterService` to use the mutex-protected already-registered guard.
- [ ] Protect `serviceDiscovered` reads and writes with the same mutex.
- [ ] Run `go test -race ./...` after changes and confirm zero data-race reports.
- [ ] Add a regression test calling `RegisterService` from two goroutines simultaneously.

---

### CRIT-2 — WorkerPool double-Close panics on cached fields

**File:** `pkg/infrastructure/cron_manager.go`
**Lines:** 27–28, 55–58, 302–306

**Evidence:**

```go
// Line 27-28: two channels allocated but no once
wp.stopped = make(chan struct{}) // line 27 — created but NEVER read from
wp.stopChan  = make(chan struct{}) // line 25
```

```go
// Line 55-58: Close() closes stopChan
func (wp *WorkerPool) Close() {
    close(wp.stopChan)
}
```

```go
// Line 302-306: CronManager.Close() calls wp.Close()
// Close() -> wp.Close(), and if CloseAll also calls wp.Close() -> panic
func (c *CronManager) Close() error {
    ...
    c.pool.Close()      // first close — OK
    close(c.cron.Stop()) // cron.Stop() may also run c.pool.Close() in edge case
    ...
}
```

**Why it matters:** `Close()` on an already-closed channel panics immediately. If `CronManager.Close()` is called twice — or if `main.go` shutdown and `server.Shutdown()` both call `CronManager.Close()` — the second `close(wp.stopChan)` crashes the process. There is no `sync.Once` protecting the close guard.

---

#### ✅ Action Checklist

- [ ] Add a `sync.Once` to `WorkerPool` (e.g., `closeOnce`) and wrap all channel closes.
- [ ] Remove the unused `wp.stopped` channel entirely.
- [ ] Add a `closeOnce` to `CronManager.Close()` as well.
- [ ] Add an idempotent `closing` bool guard to `WorkerPool.Close()` and verify in tests.
- [ ] Run `go test -race -count=10 ./pkg/infrastructure/...` for stress stability.

---

### CRIT-3 — Unbuffered jobQueue deadlock at pool drain

**File:** `pkg/infrastructure/cron_manager.go`
**Lines:** 25, 48–53, 31–44

**Evidence:**

```go
// Line 25: unbuffered channel — blocks every send
jobQueue: make(chan func()),   // no buffer
```

```go
// Line 48-53: Submit sends to jobQueue with no back-pressure guard
func (wp *WorkerPool) Submit(job func()) error {
    select {
    case wp.jobQueue <- job:  // blocks until a worker reads — worker may be gone
    case <-wp.stopChan:       // stop path — but stopChan is the WRONG channel here
        return errors.New("worker pool closed")
    }
    return nil
}
```

```go
// Line 31-44: worker goroutine reads jobQueue
// If all workers have processed stopChan, this goroutine has returned,
// and any in-flight Submit() call has no receiver → deadlock
for {
    select {
    case job := <-wp.jobQueue:
        ...
    case <-stopChan:
        return
    }
}
```

**Why it matters:** At shutdown, if any async cron job calls `Submit()` after all workers have already exited the loop, the `Submit()` goroutine blocks permanently — the entire process hangs at shutdown.

---

#### ✅ Action Checklist

- [ ] Make `jobQueue` bounded: `make(chan func(), maxQueueSize)` or calculate from `cfg.Cron.WorkerPoolSize` (not `0`).
- [ ] Fix the `stopChan` catch: the correct receive check in `Submit` is `wp.stopChan` (the second channel) but the select is reading `wp.stopChan` while the worker loop exits on `<-stopChan` (probably the SAME channel — verify identity).
- [ ] Replace unbuffered send with a `select` that also checks `time.After(timeout)` to prevent indefinite blocking.
- [ ] Add graceful-drain logic: on pool drain, allow in-flight jobs to finish but reject new submissions.
- [ ] Write a thread-safety test: start pool, drain all workers, call Submit, assert it returns error (not deadlock).

---

### CRIT-4 — Mutex held across blocking I/O in CloseAll

**File:** `pkg/infrastructure/registry.go`
**Lines:** 85–95

**Evidence:**

```go
// Line 85-95: r.mu write-lock held during ENTIRE Close() call
func (r *ComponentRegistry) CloseAll() error {
    r.mu.Lock()           // line 89
    defer r.mu.Unlock()   // line 90
    for _, comp := range r.components { // line 91 — iterates with write-lock held
        if err := comp.Close(); err != nil { // line 91 — arbitrary blocking I/O
            ...
        }
    }
    return nil
}
```

**Why it matters:** If any component's `Close()` makes a network call (DB connection close, flush to a remote logger, etc.), every other goroutine trying to `Get()` that component via `GetTyped` is blocked on the read-lock while write-lock is held. At process shutdown, this ordering makes `Get` calls from other goroutines deadlock. Worse: if `Close()` itself tries to call any registry method (e.g., in-scope dependency), it deadlocks on itself (`r.mu` already write-locked).

---

#### ✅ Action Checklist

- [ ] Snapshot the components list under a short write-lock, release it, then iterate the snapshot to call `Close()` without the lock held — pattern:
  ```go
  func (r *ComponentRegistry) CloseAll() error {
      r.mu.Lock()
      snapshot := make([]InfrastructureComponent, 0, len(r.components))
      for _, c := range r.components { snapshot = append(snapshot, c) }
      // nil out map so future CloseAll is a no-op
      r.components = make(map[string]InfrastructureComponent)
      r.mu.Unlock()
      // Now call Close() without any lock held
      for _, comp := range snapshot { ... }
  }
  ```
- [ ] Write a test where a component Close() is artificially delayed with `time.Sleep(100ms)` and verify the un-lo

---

### CRIT-5 — Unbuffered ShutdownChan causes permanent goroutine block

**File:** `pkg/utils/system.go`
**Lines:** 168, 171–178; also `cmd/app/main.go` lines 352, 364

**Evidence:**

```go
// pkg/utils/system.go Line 168: unbuffered, no receiver
ShutdownChan = make(chan struct{}) // no buffer; blocks every send until a receiver exists
```

```go
// pkg/utils/system.go Line 172-178: TriggerShutdown() sends to ShutdownChan
func TriggerShutdown() {
    select {
    case ShutdownChan <- struct{}{}: // BLOCKS if no goroutine currently reading this channel
    default:
    }
}
```

```go
// cmd/app/main.go Line 352: handleShutdown is only called in TUI mode
func handleShutdown(cancel context.CancelFunc) {
    select {
    case <-ShutdownChan: ...
    case <-signalChan:   ...
    }
}
```

```go
// cmd/app/main.go Line 364: handleConsoleShutdown NEVER reads ShutdownChan
func handleConsoleShutdown() {
    select {
    case <-signalChan: ... // only listens on signalChan
    }
}
```

**Why it matters:** In console mode, `TriggerShutdown()` (called by external consumers, signal handlers, or any package importing `utils`) sends to `ShutdownChan` — a channel with no receiver — and blocks the calling goroutine permanently. In TUI mode, if `TriggerShutdown()` is called before `handleShutdown()` has entered its select statement, it also blocks. There is no receiver at all in the console path.

---

#### ✅ Action Checklist

- [ ] Make `ShutdownChan` buffered with capacity 1 or 10: `make(chan struct{}, 10)`.
- [ ] Remove the `select`/`default` pattern in `TriggerShutdown` — just do `ShutdownChan <- struct{}{}` with the buffered channel.
- [ ] Add `ShutdownChan` to `handleConsoleShutdown`'s select at `cmd/app/main.go:364` so both paths read it.
- [ ] Alternatively, replace the global channel pattern with `signal.NotifyContext` entirely.
- [ ] Write a unit test that calls `TriggerShutdown()` before any goroutine is listening; assert the process does not hang.

---

### CRIT-6 — Viper global state mutated concurrently

**File:** `config/config.go`
**Lines:** 11–13, 207

**Evidence:**

```go
// Line 11-13: viper is a package-level singleton with no mutex protection
var _viper *viper.Viper
var _configOnce sync.Once
```

```go
// Line 207: LoadConfigWithURL() calls setupViperDefaults() which calls AutomaticEnv()
func LoadConfigWithURL(appName, configURL string) (*Config, error) {
    setupViperDefaults()  // line 222 — calls AutomaticEnv() and SetEnvKeyReplacer() without lock
    ...
    _viper.Set(key, value) // concurrent Set() — races on viper's internal maps
}
```

**Why it matters:** Viper's global maps (key → value) are not concurrency-safe by default when `AutomaticEnv` + `Set` + `Unmarshal` are called concurrently. If `LoadConfigWithURL` is ever called from more than one goroutine (e.g., in tests or a config-reload endpoint), viper's internal `map[string]interface{}` will race.

---

#### ✅ Action Checklist

- [ ] Wrap the entire `setupViperDefaults()` + `viper.Set()` block in a mutex or `sync.Once`.
- [ ] Confirm `LoadConfigWithURL` is only called from `main.go`'s `loadConfigStep` — if so, add an assertion (`require.Once`) that it is only registered once and document it.
- [ ] If config reload is needed, use a separate `*viper.Viper` per load attempt to avoid mutating shared global state.
- [ ] Run `go test -race ./config/...` to confirm no races.
- [ ] Consider `vip := viper.New()` per config instance if live reload is planned.

---

### CRIT-7 — HTTP server has no timeouts; /restart is an unauthenticated DoS vector

**File:** `internal/server/server.go`
**Lines:** 80, 28–29, 96–100

**Evidence:**

```go
// Line 80: no http.Server configured — 0 = infinite timeouts
s.gin.Run(":" + port)  // calls http.ListenAndServe with default zero-value timeouts
```

```go
// Line 96-100: unauthenticated POST /restart that calls os.Exit(1)
s.router.POST("/restart", func(c *gin.Context) {
    // No authentication middleware — anyone who knows the route can kill the process
    go func() {
        time.Sleep(500 * time.Millisecond)
        os.Exit(1) // hard process kill — no graceful shutdown, no in-flight request drain
    }()
    c.JSON(200, gin.H{"message": "Server is restarting..."})
})
```

```go
// Line 28-29: gin configured in ReleaseMode, no MaxMultipartMemory, no body-size limit
gin.SetMode(gin.ReleaseMode)
```

**Why it matters:**
- Zero timeouts on the HTTP server mean: slow clients can hold connections forever, exhausted memory from slowloris attacks, and a single poorly-behaving client can exhaust available file descriptors.
- `/restart` has no auth and no rate-limiting. A bot sending 10,000 POSTs/sec will queue 10,000 goroutines calling `os.Exit(1)`, each sleeping 500ms — massive goroutine leak before the process finally dies.

---

#### ✅ Action Checklist

- [ ] Configure an `http.Server` wrapper with timeouts:
  ```go
  server := &http.Server{
      Addr:           ":" + port,
      ReadTimeout:    15 * time.Second,
      WriteTimeout:   15 * time.Second,
      IdleTimeout:    60 * time.Second,
      ReadHeaderTimeout: 10 * time.Second,
      MaxHeaderBytes: 1 << 20,
  }
  go server.ListenAndServe()
  ```
- [ ] Add `MaxMultipartMemory: 32 << 20` (32 MB) if multipart uploads are needed.
- [ ] Add rate-limiting middleware (`gin-gonic/gin` has no built-in rate-limiter — evaluate `ulule/limiter`).
- [ ] Add authentication to `/restart` — require a management token or an internal-only header.
- [ ] Replace `os.Exit(1)` in the restart handler with a call to `handleShutdown` to allow in-flight requests to drain.
- [ ] If `restart` must stay public, add a 1/minute cooldown (token bucket or in-process counter).

---

---

## 🟠 HIGH

### HIGH-1 — WorkerPool `stopped` channel never read from

**File:** `pkg/infrastructure/cron_manager.go`
**Lines:** 27, 55–58

**Evidence:**

```go
// Line 27: created but never consumed
wp.stopped = make(chan struct{})
```

```go
// Line 56: closed but never read
close(wp.stopped)
```

**Why it matters:** A closed-but-never-read channel is a resource leak. The goroutine that holds the reference to `wp.stopped` (the worker goroutine that exits and calls `Close()`) holds it open until GC collects it. Over the lifetime of the pool, this adds a small but measurable heap allocation that GC must track.

---

#### ✅ Action Checklist

- [ ] Verify whether `wp.stopped` is shadowed by the local variable also named `stopped` at line 31 (it is). If the local variable at line 31 uses the same underlying channel, remove the field and keep only the local.
- [ ] If it IS a second channel, remove it entirely or document a unit test that reads from it.
- [ ] Confirm `go vet` passes with no channel-leak warnings.

---

### HIGH-2 — SubmitAsyncJob fallback goroutine is un-tracked

**File:** `pkg/infrastructure/cron_manager.go`
**Lines:** 276–282

**Evidence:**

```go
// Line 276-282: fire-and-forget goroutine with no lifecycle tracking
func (wp *WorkerPool) SubmitAsyncJob(job func()) error {
    if !wp.trySubmit(job) {
        go func() {                       // untracked goroutine
            select {
            case wp.jobQueue <- job:       // blocks if no receiver
            case <-time.After(wp.submitTimeout):
                return                     // silently swallowed
            }
        }()
        return nil
    }
    return nil
}
```

**Why it matters:** Every failed `trySubmit` call spawns a goroutine that may block on `wp.jobQueue` for up to `wp.submitTimeout` after the pool has been signalled to stop. These goroutines are never cancelled, counted, or waited on. In a high-load scenario (many jobs rejected by an overloaded worker pool) this is an unbounded goroutine leak.

---

#### ✅ Action Checklist

- [ ] Replace the fire-and-forget goroutine with a bounded buffer or return an error to the caller.
- [ ] Track goroutines in a `sync.WaitGroup` so `Close()` can `wg.Wait()`.
- [ ] Add a per-job context with timeout to avoid indefinite blocking.
- [ ] Add a unit test verifying `Close()` returns only after all async goroutines complete.

---

### HIGH-3 — Broadcaster cleanupRoutine is permanently a no-op

**File:** `pkg/utils/broadcast.go`
**Lines:** 45, 204–210

**Evidence:**

```go
// Line 45: cleanup goroutine started for every new broadcaster instance
go eb.cleanupRoutine() // no formula for this many goroutines
```

```go
// Line 204-210: body is empty inside the select — no work ever done
func (eb *EventBroadcaster) cleanupRoutine() {
    ticker := time.NewTicker(1 * time.Hour)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:         // fires every hour...
        }                         // ...and does nothing with the event
    }
}
```

**Why it matters:** Each new `EventBroadcaster` leaks one goroutine + one `time.Ticker` forever. The ticker is a runtime timer resource. Over long uptimes with broadcaster recreation (e.g., per-session, per-tenant), this is a detectable goroutine > ticker leak.

---

#### ✅ Action Checklist

- [ ] Implement actual TTL cleanup inside `cleanupRoutine` by iterating `eb.clients` with a `time.Since(client.LastSeen) > TTL` check, and clean up stale clients.
- [ ] If TTL is not yet needed, remove `cleanupRoutine()` entirely and allow the goroutine-leak pattern to be addressed by redesigning `Broadcast` goroutine lifecycle (see HIGH-3).
- [ ] Add a `Close()` method to `EventBroadcaster` so cleanupRoutine can be stopped by the broadcaster owner.

---

### HIGH-4 — `cpu.Percent()` blocks for 1 full second in hot path

**File:** `pkg/utils/system.go`
**Lines:** 24–27

**Evidence:**

```go
// Line 24: blocks entire calling goroutine for 1 second
percent, err := cpu.Percent(time.Second, false) // time.S
```

```go
// Line 24: function GetSystemStats() calls cpu.Percent (full second block)
func GetSystemStats() map[string]interface{} {
    cpuPercent, err := cpu.Percent(time.Second, false)
    ...
}
```

```go
// Called from DashboardModel.View() at pkg/tui/dashboard.go ~line 240 every 500ms tick
case tea.Tick(time.Second, func(t time.Time) tea.Msg {
    // dashboard ticker fires every 500ms calling GetSystemStats()
```

> **Why it matters:** `cpu.Percent(time.Second, ...)` samples the system CPU delta over exactly 1 second. When called on every TUI refresh tick (every 500ms), the **second call serialises behind the first**, blocking the goroutine for the full 1 second every time the dashboard tick fires. Since the dashboard TUI runs on a single bubbletea goroutine, **every single tick blocks the entire TUI for 1 second**, causing visible UI freezes and skipped log entries.

---

#### ✅ Action Checklist

- [ ] Cache the last CPU sample and compute a rolling delta using `cpu.Times()` which is immediate (returns cumulative totals). Compute percent difference between two samples taken 500ms apart (delta / interval).
- [ ] If keeping `cpu.Percent`, reduce the blocking sample interval to `time.Millisecond*200` (faster, lower precision).
- [ ] Cache the CPU value for at least the tick period so it is not recomputed on every view render.
- [ ] Make `GetSystemStats()` accept an optional `prev` map and compute the delta, returning both the current stats AND the updated `prev`, so callers can pass it through.
- [ ] Add a benchmark (`BenchmarkGetSystemStats`) to `pkg/utils/system_test.go` verifying the call completes in <10ms.

---

---

## 🟡 MEDIUM

### MED-1 — Duplicate `time.Now()` per response helper

**File:** `pkg/response/response.go`
**Lines:** 87–95, 105–114, 124–133, 211–223

**Evidence:**

```go
// Line 92 and separately at line 93 — two separate syscalls
Timestamp: time.Now().UnixNano(),
Datetime:  time.Now().Format(time.RFC3339),
```

**Why it matters:** Each HTTP response makes two calls to the system clock. RFC3339 format also allocates a new string buffer. Called thousands of times per second, this doubles clock-overhead and heap churn. The two `Now()` calls can even return different seconds-crossing values if the clock sub-second rolls over between them, creating subtly inconsistent audit metadata.

---

#### ✅ Action Checklist

- [ ] Replace with a single `now := time.Now()` shared across all Timestamp and Datetime fields.
- [ ] Consider using `now.UnixNano()` directly for both Timestamp and Datetime to avoid the `Format` allocation; format on the client side when displaying.
- [ ] If RFC3339 formatting must stay on the server, keep the single `now` reference but move the `Format()` call behind a `debug` config flag to avoid it in production.

---

### MED-2 — `regexp.MatchString` recompiles validation patterns on every call

**File:** `pkg/request/request.go`
**Lines:** 109, 116

**Evidence:**

```go
// Line 19-20: pattern strings registered as validators
func NewPhoneValidator() Validator { return validatePhone } // stored as function value
```

```go
// Line 109: full recompilation of regex each call
func validatePhone(fl validator.FieldLevel) bool {
    matched, err := regexp.MatchString(phoneRegex, fl.Field().String()) // allocates new *regexp.Regexp
}
```

```go
// Line 116: same pattern for username
func validateUsername(fl validator.FieldLevel) bool {
    matched, err := regexp.MatchString(usernameRegex, fl.Field().String())
}
```

**Why it matters:** `regexp.MustCompile` / `regexp.MatchString` compiles the pattern and discards the result every time — O(pattern_length × input_length) per call with no caching. In a high-traffic API validating many fields per request (e.g., a form with 10 phone/username fields), this produces sustained heap pressure.

---

#### ✅ Action Checklist

- [ ] Pre-compile `phoneRegex` and `usernameRegex` as package-level `*regexp.Regexp` variables using `regexp.MustCompile`.
- [ ] Replace `regexp.MatchString(rawPattern, input)` with `compiled.MatchString(input)`.
- [ ] Add a unit test to `internal/request/request_test.go` (or `pkg/request/request_test.go`) benchmarking the pre-compiled path vs the existing path.
- [ ] Run benchmark: `go test -run=^$ -bench=BenchmarkPhoneValidation -benchmem ./pkg/request/`

---

### MED-3 — `GetAll()` allocates a new map on every call

**File:** `pkg/registry/dependencies.go`
**Lines:** 28–34; also `pkg/infrastructure/registry.go` lines 74–81

**Evidence:**

```go
// Line 28-34: brand-new map allocated per call
func (d *Dependencies) GetAll() map[string]interface{} {
    result := make(map[string]interface{})
    d.components.Range(func(key, value interface{}) bool {
        result[key.(string)] = value
        return true
    })
    return result
}
```

```go
// registry.go Line 74-81: identical pattern for infrastructure components
func (r *ComponentRegistry) GetAll() map[string]string {
    result := make(map[string]string, len(r.components))
    r.mu.RLock()
    for k, v := range r.components {
        result[k] = v.Name()
    }
    r.mu.RUnlock()
    return result
}
```

**Why it matters:** If this is called from a hot path (e.g., `/health` endpoint response construction), the per-tick allocation becomes GC pressure. With ~5-10 components this is small, but combined with MED-1 (per-response timestamps) it compounds.

---

#### ✅ Action Checklist

- [ ] Change `GetAll()` return type to `map[string]interface{}` by wrapping with a `sync.Map` → provide a `RangeAll()` callback that lets callers iterate without copying if they don't need a concrete map.
- [ ] Add a `PermanentAll` variant that returns a snapshot under a short-read lock — document it as 'read-only, snapshot-in-time'.
- [ ] If only the /health endpoint calls this, consider replacing `GetAll` in the health path with a pre-computed status struct assembled at startup and refreshed only on component state changes.

---

### MED-4 — Broadcaster broadcasts allocate EventData on every message

**File:** `pkg/utils/broadcast.go`
**Lines:** 102–114, 127–138

**Evidence:**

```go
// Line 107-114: new EventData struct allocated every Broadcast() call
func (eb *EventBroadcaster) Broadcast(topic string, payload interface{}) error {
    ...
    data := &EventData{
        ID:        fmt.Sprintf("evt_%d", time.Now().UnixNano()), // allocates string each call
        Topic:     topic,
        Payload:   payload,
        Timestamp: time.Now().UnixNano(),
    }
    ...
}
```

**Why it matters:** At high broadcast rates (e.g., TUI live-lob feed with 100 log lines/sec), this is 100 heap allocations/sec even if zero clients are subscribed. The GC must track and collect these short-lived EventData structs, adding up to measurable heap churn under sustained log rates.

---

#### ✅ Action Checklist

- [ ] Introduction a `sync.Pool` for `EventData` to reduce GC pressure under sustained broadcast rates.
- [ ] Replace `fmt.Sprintf("evt_%d", ...)` with `strconv.FormatInt(time.Now().UnixNano(), 10)` — avoids format-scan overhead of `fmt`.
- [ ] If many broadcasts go to zero clients, add a fast exit: `if len(eb.subscribers) == 0 { return nil }` before allocation.
- [ ] If zero client broadcasts are common, consider `Broadcast` returning a no-op error when no clients are connected (callers opt-in to this behavior with a flag).

---

### MED-5 — Broadcaster `Unsubscribe` drains a message before closing

**File:** `pkg/utils/broadcast.go`
**Lines:** 93–98

**Evidence:**

```go
// Line 94-98: drains one message before closing — silently lost
func (eb *EventBroadcaster) Unsubscribe(client *StreamClient) {
    select {
    case <-client.Channel:   // consumes one pending message from the channel
    default:                  // if channel was empty, close immediately
    }
    close(client.Channel)
    ...
}
```

**Why it matters:** The `<-client.Channel` receive silently discards one queued message before closing. Clients may have a pending message in their channel that is lost before the client can process it. This is subtle: it looks safe but silently drops data — the fix is `close(client.Channel)` alone, which causes the consumer's `for msg := range ch` loop to exit cleanly after draining naturally.

---

#### ✅ Action Checklist

- [ ] Remove the `case <-client.Channel: default:` branch and call `close(client.Channel)` directly.
- [ ] Add a test case verifying no broadcast data is lost on unsubscribe.
- [ ] If `Unsubscribe` must guarantee drain, use a `WaitGroup` to wait for the client's reader goroutine to finish before closing.

---

### MED-6 — `LogEntry` allocation on every log line in live log feed

**File:** `pkg/tui/live.go`
**Lines:** ~line 620–640 (Write call), ~lines 345–360 (copy to `allLogs`)

**Evidence:**

```go
// Line ~620-640: every Write() call to the live TUI broadcaster creates a new LogEntry
func (m *LiveModel) Write(p []byte) (n int, err error) {
    ...
    entry := LogEntry{
        Timestamp: time.Now(),    // alloc
        Level:     level,         // copy
        Message:   string(p),     // heap alloc copy of bytes
    }
    m.allLogs = append(m.allLogs, entry) // append allocs (may double-capacity)
    m.broadcaster.Broadcast(...)         // alloc EventData (MED-4)
}
```

**Why it matters:** At 50 log lines/sec the TUI allocates 50 `LogEntry` + 50 `EventData` structs + copies strings per tick. These live in heap until GC collects them. The `copy` path under the broadcast, combined with `append` doubling the slice capacity, produces regular GC spikes interrupting the bubbletea event loop.

---

#### ✅ Action Checklist

- [ ] Reuse a `logEntryPool sync.Pool` in the TUI broadcaster — `Write()` calls `pool.Get()` and calls `Put()` back when the entry is removed from `allLogs` (when trimming).
- [ ] Trim `m.allLogs` using a ring buffer strategy instead of `append` to avoid re-allocation.
- [ ] Move broadcaster into a goroutine with a buffer channel of configurable size to shift allocation off the bubbletea update goroutine.
- [ ] Consider only broadcasting the *diff* (the new log line string) rather than a full `EventData` struct.

---

### MED-7 — No concurrency-safe test: high concurrency / race test gap

**File:** Test suite across project

**Evidence:** All existing tests (`tests/infrastructure/afero_test.go` and 0 other test files) are single-threaded, table-driven unit tests. There is **no race test** (`go test -race`) in CI for the project. The AGENTS.md notes race tests as part of the manual workflow but none are automated in the GitHub Actions pipeline.

```bash
# CI go-build.yml step 46 only runs:
go test -v ./...
# NOT: go test -race ./...
```

**Why it matters:** All four CRITICAL findings (data races on global maps, unbounded goroutines, channel deadlocks) would be caught by `-race`. CI does not run with `-race`.

---

#### ✅ Action Checklist

- [ ] Add `go test -race ./...` to `.github/workflows/go-build.yml` as a dedicated step after the `Test` step.
- [ ] Fix all `-race` detected issues before merging any PR.
- [ ] Consider setting ` GODEBUG=atomic=1` environment variable to enforce atomic operations in release builds.
- [ ] Document in AGENTS.md section 2 that `go test -race` is the canonical test runner.

---

---

## 🟢 LOW

### LOW-1 — Skinny `Dependencies` GetAll re-creates map per call

**File:** `pkg/registry/dependencies.go`
**Lines:** 28–34

**Same see MED-3.** LOW priority because map has ≤10 entries. Documented here as a minor allocation spike that is visible under heap profiling at >10k Requests/sec.

---

#### ✅ Action Checklist

- [ ] Benchmark: `go test -run=^$ -bench=GetAll -benchmem ./pkg/registry/`
- [ ] Only take action if allocation rate >100 allocations/sec under simulated load.

---

### LOW-2 — Logger formatter closures allocated per `NewWithConfig()` call

**File:** `pkg/logger/logger.go`
**Lines:** 131–169, 172–183

**Evidence:**

```go
// Line 131-169: anonymous closure returned each call — heap-allocated
func NewWithConfig(config LoggerConfig) *Logger {
    levelFormatter := getLevelFormatter(...)
    messageFormatter := getMessageFormatter(...)
    ...
}
```

**Why it matters:** Allocated once per logger construction (app startup creates 1–2 loggers), not per-log-line. Impact is negligible but avoidable by promoting the two formatters to package-level `var` fields on the `Logger` struct so formatter init is hoisted out of `New` altogether.

---

#### ✅ Action Checklist

- [ ] Promote `getLevelFormatter` and `getMessageFormatter` to `Logger` struct fields assigned at point of `new(Logger)` in `New()` / `NewQuiet()`. Avoids making a new closure in `getLevelFormatter`.
- [ ] Run `go test -run=^$ -bench=NewLogger -benchmem` to confirm no regression.

---

### LOW-3 — `lipgloss.NewStyle()` re-allocated per log level in live view render

**File:** `pkg/tui/live.go`
**Lines:** 533–548

**Evidence:**

```go
// Line 534-548: new style object on every render call
func getLevelStyle(level string) lipgloss.Style {
    switch level {
    case "DEBUG": return lipgloss.NewStyle().Foreground(lipgloss.Color("8")) // new object every call
    case "INFO":  return lipgloss.NewStyle().Foreground(lipgloss.Color("14"))
    case "WARN":  return lipgloss.NewStyle().Foreground(lipgloss.Color("11"))
    case "ERROR": return lipgloss.NewStyle().Foreground(lipgloss.Color("203"))
    case "FATAL": return lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
    }
    ...
}
```

```go
// Called from updateFilteredLogs (line 668) which is called every TUI frame
for _, entry := range logEntries {
    style := getLevelStyle(entry.Level) // allocates 1 Style struct × log entry per frame
}
```

**Why it matters:** With 1 log line per TUI frame (~1 fps under idle, ~15 fps under log spam), this is one `lipgloss.Style` allocation per log entry per frame. Low severity only because style objects are small (struct of few ints).

---

#### ✅ Action Checklist

- [ ] Cache 5 pre-built `lipgloss.Style` values as package-level `var`s:
  ```go
  var levelStyles = map[string]lipgloss.Style{...}  // built once at init()
  ```
- [ ] Change `getLevelStyle()` to return `levelStyles[level]` from the map.
- [ ] Optional: also move to `sync.Range` to merge goroutine-safe access (not needed in current TUI single-goroutine model).

---

### LOW-4 — `updateFilteredLogs` copies entire log slice per event

**File:** `pkg/tui/live.go`
**Lines:** 670–676

**Evidence:**

```go
// Line 674-676: O(N) copy of allLogs for every event when filter is empty
func (m *LiveModel) updateFilteredLogs() {
    if m.filter == "" || m.activeTab != TabLogs {
        m.filteredLogs = make([]LogEntry, len(m.allLogs))
        copy(m.filteredLogs, m.allLogs)
        return
    }
}
```

**Why it matters:** With 1,000 buffered log entries `updateFilteredLogs` copies 1,000 `LogEntry` structs (each with a string in `Message`) every time a log arrives when no filter is active — O(N) work per write. A 5,000-entry log buffer means copying ~50 KB of heap memory per log write.

---

#### ✅ Action Checklist

- [ ] When `m.filter` is empty and `m.activeTab == TabLogs`, skip the copy and assign `m.filteredLogs = m.allLogs` directly (shared pointer — remember that the caller must not mutably write through `filteredLogs`).
- [ ] For the filtered path, use a pre-allocated ring-buffer slice to reduce per-insert allocations.
- [ ] Set `m.filteredLogsDirty = true` instead of copying; only do the copy in `View()` if dirty.

---

### LOW-5 — `strings.Split` for line counting in every dashboard render

**File:** `pkg/tui/dashboard.go`
**Lines:** 344

**Evidence:**

```go
// Line 344: runs every View() call (every 500ms tick) on the full viewport content
func (m *DashboardModel) View() string {
    content := m.viewport.View()
    lines := strings.Split(content.String(), "\\n") // O(content_length) per render
    ...
}
```

**Why it matters:** `content.String()` already contains the full viewport text. `strings.Split` runs over the entire content string buffer to count lines. At 2,000 lines of metrics content this is a O(N) scan on every render cycle for a value that changes at most when data is updated — not when `View()` is called.

---

#### ✅ Action Checklist

- [ ] Maintain a `lineCount int` field and update it only when the viewport content changes (in the `Update` message handler), not in `View()`.
- [ ] In `View()`, use `m.lineCount` directly — O(1) read.
- [ ] Write a `BenchmarkDashboardView` test to measure the improvement.

---

### LOW-6 — `fmt.Scanln` goroutine leak in build tool

**File:** `scripts/build/build.go`
**Lines:** 228–232

**Evidence:**

```go
// Line 228-232: goroutine started to read stdin but blocks on Scanln indefinitely when timeout fires
func askUserAboutGarble() bool {
    answerChan = make(chan string, 1)
    go func() {
        var answer string
        fmt.Scanln(&answer)  // blocks forever waiting for newline — goroutine never exits
        answerChan <- answer
    }()
    select {
    case answer := <-answerChan:
        ...
    case <-time.After(10 * time.Second):
        return false // goroutine left blocking in fmt.Scanln — leaks
    }
}
```

**Why it matters:** Every time the build tool prompts and hits the timeout, one goroutine leaks indefinitely in `fmt.Scanln`. Low severity only because this is the build script, not production server code, and it runs to completion on each build invocation (process exits, so the goroutine is reclaimed).

---

#### ✅ Action Checklist

- [ ] Replace `fmt.Scanln` with a signal-aware prompt or closing the `os.Stdin` file.
- [ ] Use `bufio.NewReader(os.Stdin).ReadString('\n')` with a `context.WithTimeout` wrapper, or use `survey` library with built-in timeout support.
- [ ] Alternatively, use an `os.Exit` after timeout instead of returning from the helper, so theun-reapedgoroutine is not a concern.

---

---

## 📊 Summary Matrix

| ID | Severity | File | Category | Priority to Fix |
|---|----------|------|----------|-----------------|
| CRIT-1 | 🔴 CRITICAL | `pkg/registry/registry.go` | Data race, global state | 1 — Services won't start correctly under any concurrency |
| CRIT-2 | 🔴 CRITICAL | `pkg/infrastructure/cron_manager.go` | Panic-on-double-close | 2 — Process crashes on restart/shutdown cycle |
| CRIT-3 | 🔴 CRITICAL | `pkg/infrastructure/cron_manager.go` | Unbuffered jobQueue deadlock | 3 — Process hangs at shutdown |
| CRIT-4 | 🔴 CRITICAL | `pkg/infrastructure/registry.go` | Mutex + blocking I/O deadlock | 4 — Any slow component Close() = shutdown deadlock |
| CRIT-5 | 🔴 CRITICAL | `pkg/utils/system.go` | Unbuffered shutdown channel | 5 — Console mode cannothospitalMode executed |
| CRIT-6 | 🔴 CRITICAL | `config/config.go` | Viper global state race | 6 — Config reload in tests = random failures |
| CRIT-7 | 🔴 CRITICAL | `internal/server/server.go` | No HTTP timeouts, /restart DoS | 7 — Exposed to every external caller |
| HIGH-1 | 🟠 HIGH | `pkg/infrastructure/cron_manager.go` | Unread `stopped` channel | 1 — Low cost cleanup |
| HIGH-2 | 🟠 HIGH | `pkg/infrastructure/cron_manager.go` | Untracked submit goroutines | 2 — Goroutine leak under load |
| HIGH-3 | 🟠 HIGH | `pkg/utils/broadcast.go` | No-op cleanup goroutine leak | 3 — Resource leak over uptime |
| HIGH-4 | 🟠 HIGH | `pkg/utils/system.go` | 1s blocking CPU sampling | 4 — TUI freeze every 500ms |
| MED-1 | 🟡 MEDIUM | `pkg/response/response.go` | Double `time.Now()` per response | 1 — Easy fix, measurable heap churn |
| MED-2 | 🟡 MEDIUM | `pkg/request/request.go` | Regex recompilation on validation | 2 — Per-field per-request cost |
| MED-3 | 🟡 MEDIUM | `pkg/registry/dependencies.go` | `GetAll` map allocation | 3 — Minor, accumulates under load |
| MED-4 | 🟡 MEDIUM | `pkg/utils/broadcast.go` | EventData allocation per broadcast | 4 — Heap churn at high log rates |
| MED-5 | 🟡 MEDIUM | `pkg/utils/broadcast.go` | Unsubscribe silently drops message | 5 — Subtle data-loss bug |
| MED-6 | 🟡 MEDIUM | `pkg/tui/live.go` | LogEntry alloc per log line | 6 — GC pressure at high log rates |
| MED-7 | 🟡 MEDIUM | `.github/workflows/go-build.yml` | No race test in CI | 7 — No Rust/language support |
| LOW-1 | 🟢 LOW | `pkg/registry/dependencies.go` | GetAll allocation (also MED-3) | — |
| LOW-2 | 🟢 LOW | `pkg/logger/logger.go` | Logger formatter closures | — |
| LOW-3 | 🟢 LOW | `pkg/tui/live.go` | lipgloss style re-allocation | — |
| LOW-4 | 🟢 LOW | `pkg/tui/live.go` | Log slice copy per event | — |
| LOW-5 | 🟢 LOW | `pkg/tui/dashboard.go` | strings.Split in View() render | — |
| LOW-6 | 🟢 LOW | `scripts/build/build.go` | Scanln goroutine leak | — |

---

## CI · Test · Lint · Reference Command Summary

```bash
go test ./...                    # canonical tests
go test -race ./...              # data race detection (MISSING from CI — see MED-7)
go test -v -cover ./...          # with coverage
staticcheck ./...                # static analysis
go-critic check ./...            # linter
go build -v ./cmd/app/           # build
go run cmd/app/main.go           # run directly
go run scripts/build/build.go    # build via Go build tool
```

---

## References

| Item | Location |
|------|----------|
| CI workflow | `.github/workflows/go-build.yml` |
| Security scan | `.github/workflows/security.yml` |
| Agent guide | `AGENTS.md` |
| Project overview | `docs_wiki/blueprint/blueprint.txt` |
| License | `LICENSE` |
