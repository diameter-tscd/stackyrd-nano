package infrastructure

import (
	"context"
	"fmt"
	"time"
)

// AsyncResult represents the result of an asynchronous operation
type AsyncResult[T any] struct {
	Value T
	Error error
	Done  chan struct{}
}

// NewAsyncResult creates a new async result
func NewAsyncResult[T any]() *AsyncResult[T] {
	return &AsyncResult[T]{
		Done: make(chan struct{}),
	}
}

// Complete marks the async operation as complete
func (r *AsyncResult[T]) Complete(value T, err error) {
	r.Value = value
	r.Error = err
	close(r.Done)
}

// Wait blocks until the operation is complete and returns the result
func (r *AsyncResult[T]) Wait() (T, error) {
	<-r.Done
	return r.Value, r.Error
}

// WaitWithTimeout waits for the operation with a timeout
func (r *AsyncResult[T]) WaitWithTimeout(timeout time.Duration) (T, error) {
	select {
	case <-r.Done:
		return r.Value, r.Error
	case <-time.After(timeout):
		var zero T
		return zero, context.DeadlineExceeded
	}
}

// IsDone checks if the operation is complete without blocking
func (r *AsyncResult[T]) IsDone() bool {
	select {
	case <-r.Done:
		return true
	default:
		return false
	}
}

// AsyncOperation represents an operation that can be executed asynchronously
type AsyncOperation[T any] func(ctx context.Context) (T, error)

// ExecuteAsync executes an operation asynchronously and returns an AsyncResult
func ExecuteAsync[T any](ctx context.Context, operation AsyncOperation[T]) *AsyncResult[T] {
	result := NewAsyncResult[T]()

	go func() {
		defer func() {
			if r := recover(); r != nil {
				// Handle panic in async operation
				result.Complete(*new(T), fmt.Errorf("async operation panicked: %v", r))
			}
		}()

		value, err := operation(ctx)
		result.Complete(value, err)
	}()

	return result
}

// BatchAsyncResult represents the result of a batch asynchronous operation
type BatchAsyncResult[T any] struct {
	Results []AsyncResult[T]
	Done    chan struct{}
}

// NewBatchAsyncResult creates a new batch async result
func NewBatchAsyncResult[T any](count int) *BatchAsyncResult[T] {
	results := make([]AsyncResult[T], count)
	for i := range results {
		results[i] = *NewAsyncResult[T]()
	}

	return &BatchAsyncResult[T]{
		Results: results,
		Done:    make(chan struct{}),
	}
}

// Complete marks the batch operation as complete
func (br *BatchAsyncResult[T]) Complete() {
	close(br.Done)
}

// WaitAll waits for all operations in the batch to complete
func (br *BatchAsyncResult[T]) WaitAll() ([]T, []error) {
	<-br.Done

	values := make([]T, len(br.Results))
	errors := make([]error, len(br.Results))

	for i, result := range br.Results {
		values[i], errors[i] = result.Wait()
	}

	return values, errors
}

// ExecuteBatchAsync executes multiple operations asynchronously
func ExecuteBatchAsync[T any](ctx context.Context, operations []AsyncOperation[T]) *BatchAsyncResult[T] {
	result := NewBatchAsyncResult[T](len(operations))

	for i, operation := range operations {
		go func(index int, op AsyncOperation[T]) {
			defer func() {
				if r := recover(); r != nil {
					result.Results[index].Complete(*new(T), fmt.Errorf("batch operation %d panicked: %v", index, r))
				}
			}()

			value, err := op(ctx)
			result.Results[index].Complete(value, err)
		}(i, operation)
	}

	// Mark batch as complete when all individual operations are done
	go func() {
		for _, r := range result.Results {
			<-r.Done
		}
		result.Complete()
	}()

	return result
}

// WorkerPool manages a pool of goroutines for executing async operations
type WorkerPool struct {
	workers  int
	jobQueue chan func()
	stopChan chan struct{}
	stopped  chan struct{}
}

// NewWorkerPool creates a new worker pool
func NewWorkerPool(workers int) *WorkerPool {
	return &WorkerPool{
		workers:  workers,
		jobQueue: make(chan func(), workers*2),
		stopChan: make(chan struct{}),
		stopped:  make(chan struct{}),
	}
}

// Start starts the worker pool
func (wp *WorkerPool) Start() {
	for i := 0; i < wp.workers; i++ {
		go wp.worker()
	}
}

// Stop stops the worker pool
func (wp *WorkerPool) Stop() {
	close(wp.stopChan)
	<-wp.stopped
}

// Submit submits a job to the worker pool
func (wp *WorkerPool) Submit(job func()) {
	select {
	case wp.jobQueue <- job:
	case <-wp.stopChan:
		// Pool is stopping, don't accept new jobs
	}
}

func (wp *WorkerPool) worker() {
	defer func() {
		if r := recover(); r != nil {
			// Log panic and continue
		}
	}()

	for {
		select {
		case job := <-wp.jobQueue:
			job()
		case <-wp.stopChan:
			return
		}
	}
}

// Close closes the worker pool
func (wp *WorkerPool) Close() {
	wp.Stop()
	close(wp.jobQueue)
	close(wp.stopped)
}
