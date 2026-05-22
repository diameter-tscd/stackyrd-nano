package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"stackyrd-nano/pkg/request"
	"stackyrd-nano/pkg/response"
)

// ─── Response Success/Error throughput ─────────────────────────────────────────
// MED-1 fix: single time.Now() per response (Success/Error/Created) instead
// of two independent clock syscalls per call.
//
// Run:  go test -run=^$ -bench=BenchmarkResponse -benchmem -v ./tests/

func BenchmarkResponse_Success(b *testing.B) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		response.Success(c, map[string]string{"ok": "true"})
	}
}

func BenchmarkResponse_Error(b *testing.B) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		response.Error(c, 400, "TEST", "test error")
	}
}

// ─── Request validator throughput ───────────────────────────────────────────────
// MED-2 fix: pre-compiled regex — avoids allocating a new *regexp.Regexp on every
// validation call.  Benchmarks Validate() on a struct that triggers both custom
// `phone` and `username` validators to hit both pre-compiled patterns.

type perfProfile struct {
	Phone    string `json:"phone"    validate:"required,phone"`
	Username string `json:"username" validate:"required,username"`
	Email    string `json:"email"    validate:"required,email"`
	Age      int    `json:"age"      validate:"required,gte=0,lte=150"`
}

// Warm-up instance — Validate() is called once before the timed loop to
// discard one-time setup costs (validator engine state init).
var warmProfile = perfProfile{
	Phone:    "+1-415-555-0100",
	Username: "valid_user_01",
	Email:    "user@example.com",
	Age:      30,
}

func BenchmarkRequest_Validate(b *testing.B) {
	// Warm-up: first call seeds the validator caches
	if err := request.Validate(&warmProfile); err != nil {
		b.Fatalf("warm-up Validate: %v", err)
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		p := warmProfile // copy so that Validate doesn't see a stale pointer
		_ = request.Validate(&p)
	}
}

func BenchmarkRequest_Bind(b *testing.B) {
	// Bind exercises ShouldBind + Validate in one call; nil body returns early
	// so the hot path is the request-parse + schema-validate branch.
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("POST", "/perf", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var req perfProfile
		_ = request.Bind(c, &req)
	}
}
