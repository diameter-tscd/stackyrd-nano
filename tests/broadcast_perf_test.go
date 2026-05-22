package tests

import (
	"strconv"
	"sync"
	"testing"

	"stackyrd-nano/pkg/utils"
)

// ─── Broadcaster: Broadcast throughput with multiple fan-out sizes ─────────────
// MED-4: fast-exit path when no clients; strconv.FormatInt for EventData.ID.
//
// Run:  go test -run=^$ -bench=BenchmarkBroadcaster -benchmem -v ./tests/

func BenchmarkBroadcaster_Broadcast(b *testing.B) {
	sizes := []int{1, 10, 100, 1_000}
	for _, n := range sizes {
		b.Run(strconv.Itoa(n)+"subs", func(b *testing.B) {
			eb := utils.NewEventBroadcaster()
			for i := 0; i < n; i++ {
				eb.Subscribe("perf-test")
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				eb.Broadcast("perf-test", "event", "payload", nil)
			}
		})
	}
}

// ─── Broadcaster: Subscribe + Unsubscribe round-trip ───────────────────────────
// MED-5: Unsubscribe closes Channel directly — no silent drain before close.
func BenchmarkBroadcaster_SubscribeUnsubscribe(b *testing.B) {
	b.ReportAllocs()
	eb := utils.NewEventBroadcaster()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		client := eb.Subscribe("perf-test")
		eb.Unsubscribe(client.ID)
	}
}

// ─── Broadcaster: concurrent broadcast — no unsubscribes during broadcast ───────
// Stress test: 4 goroutines broadcasting to 100 subscribers concurrently.
// Unsubscribes are done after all broadcasts finish to avoid the inherent
// send-to-closed-channel race between Broadcast and Unsubscribe.
func TestBroadcaster_ConcurrentBroadcast_NoPanic(t *testing.T) {
	eb := utils.NewEventBroadcaster()

	for i := 0; i < 100; i++ {
		eb.Subscribe("perf-test")
	}
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("unexpected panic: %v", r)
		}
	}()

	var wg sync.WaitGroup
	for g := 0; g < 4; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 1_000; i++ {
				eb.Broadcast("perf-test", "evt", "data", nil)
			}
		}()
	}
	wg.Wait()
}

// ─── Broadcaster: zero-subscriber fast-exit ─────────────────────────────────────
// MED-4: Broadcast to a stream with no subscribers must not allocate.
func BenchmarkBroadcaster_NoSubscribers_FastExit(b *testing.B) {
	eb := utils.NewEventBroadcaster()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		eb.Broadcast("empty-stream", "evt", "data", nil)
	}
}

// ─── Broadcaster: BroadcastToAll throughput ─────────────────────────────────────

func BenchmarkBroadcaster_BroadcastToAll(b *testing.B) {
	eb := utils.NewEventBroadcaster()
	for i := 0; i < 100; i++ {
		eb.Subscribe("stream-a")
		eb.Subscribe("stream-b")
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		eb.BroadcastToAll("event", "payload", nil)
	}
}
