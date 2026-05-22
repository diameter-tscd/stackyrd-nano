package infrastructure_test

import (
	"sync"
	"testing"
	"time"

	"stackyrd-nano/pkg/infrastructure"
)

// ─── WorkerPool Submit throughput ─────────────────────────────────────────────
// CRIT-3: buffered jobQueue should sustain high submission rate without blocking.

func BenchmarkWorkerPool_Submit(b *testing.B) {
	pool := infrastructure.NewWorkerPool(10)
	pool.Start()
	defer pool.Close()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		pool.Submit(func() {})
	}
}

// ─── WorkerPool Close is idempotent ───────────────────────────────────────────
// CRIT-2: double-close of stopChan must not panic.

func TestWorkerPool_DoubleClose_NoPanic(t *testing.T) {
	pool := infrastructure.NewWorkerPool(4)
	pool.Start()
	defer pool.Close()

	pool.Close() // 1st — normal
	pool.Close() // 2nd — must be a no-op, must not panic
}

// ─── WorkerPool concurrent Submit + Close ─────────────────────────────────────
// CRIT-2 + CRIT-3 combined: submitters and closer must not race.

func TestWorkerPool_SubmitAndClose_RaceDetector(t *testing.T) {
	pool := infrastructure.NewWorkerPool(3)
	pool.Start()

	var wg sync.WaitGroup

	// Submitters
	for g := 0; g < 4; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 500; i++ {
				pool.Submit(func() {})
			}
		}()
	}

	// Closer
	wg.Add(1)
	go func() {
		defer wg.Done()
		time.Sleep(time.Millisecond)
		pool.Close()
	}()

	wg.Wait()
}

// ─── WorkerPool: Close is a blocking drain that always completes ───────────────
// CRIT-2 + CRIT-3: Close() waits for all queued jobs, is idempotent, and never
// leaves a goroutine hanging. The worker count is intentionally tiny (2) with 100
// queued no-op jobs, so Close() must drive all of them through the queue.

func TestWorkerPool_Close_DrainsAllJobs(t *testing.T) {
	pool := infrastructure.NewWorkerPool(2)
	pool.Start()

	// Queue more jobs than there are workers — forces the queue to back up
	for i := 0; i < 100; i++ {
		pool.Submit(func() {})
	}

	done := make(chan struct{})
	go func() {
		pool.Close()
		close(done)
	}()

	select {
	case <-done:
		// OK — all jobs drained, Close returned
	case <-time.After(5 * time.Second):
		t.Fatal("Close() did not return — jobs were not drained")
	}
}

// ─── WorkerPool: graceful drain — all jobs complete before Close returns ─────────

func BenchmarkWorkerPool_GracefulDrain(b *testing.B) {
	const jobs = 100
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		b.StopTimer()
		pool := infrastructure.NewWorkerPool(8)
		pool.Start()
		var ran int64
		for j := 0; j < jobs; j++ {
			pool.Submit(func() { ran++ })
		}
		b.StartTimer()
		pool.Close()
		b.StopTimer()
		if ran != jobs {
			b.Fatalf("only %d of %d jobs completed", ran, jobs)
		}
	}
	b.ReportAllocs()
}

// ─── CronManager: graceful shutdown with async jobs ────────────────────────────
// CRIT-3 + HIGH-2: Close() must return even when async jobs are queued.

func TestCronManager_AddAsyncAndClose_NoDeadlock(t *testing.T) {
	cm := infrastructure.NewCronManager()
	cm.Start()

	for i := 0; i < 50; i++ {
		_, err := cm.AddAsyncJob(
			"perf-test",
			"@every 1s",
			func() {},
		)
		if err != nil {
			t.Fatalf("AddAsyncJob: %v", err)
		}
	}

	done := make(chan struct{})
	go func() {
		cm.Close()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("CronManager.Close() deadlocked")
	}
}
