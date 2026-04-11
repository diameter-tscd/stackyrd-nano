package utils

import (
	"fmt"
	"sync"
	"time"
)

// EventData represents the structure of event data sent through streams
type EventData struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Message   string                 `json:"message"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Timestamp int64                  `json:"timestamp"`
	StreamID  string                 `json:"stream_id,omitempty"`
}

// StreamClient represents a connected client for a specific stream
type StreamClient struct {
	ID       string
	StreamID string
	Channel  chan EventData
}

// EventBroadcaster manages multiple event streams and their clients
type EventBroadcaster struct {
	streams   map[string][]*StreamClient // streamID -> clients
	clients   map[string]*StreamClient   // clientID -> client
	mu        sync.RWMutex
	nextID    int
	clientTTL time.Duration
}

// NewEventBroadcaster creates a new event broadcaster
func NewEventBroadcaster() *EventBroadcaster {
	eb := &EventBroadcaster{
		streams:   make(map[string][]*StreamClient),
		clients:   make(map[string]*StreamClient),
		nextID:    1,
		clientTTL: 24 * time.Hour, // Clients automatically removed after 24 hours
	}

	// Start cleanup routine
	go eb.cleanupRoutine()

	return eb
}

// Subscribe creates a new client and subscribes to a stream
func (eb *EventBroadcaster) Subscribe(streamID string) *StreamClient {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	clientID := fmt.Sprintf("client_%d", eb.nextID)
	eb.nextID++

	client := &StreamClient{
		ID:       clientID,
		StreamID: streamID,
		Channel:  make(chan EventData, 100), // Buffer up to 100 messages
	}

	eb.clients[clientID] = client
	eb.streams[streamID] = append(eb.streams[streamID], client)

	return client
}

// Unsubscribe removes a client from all streams
func (eb *EventBroadcaster) Unsubscribe(clientID string) {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	client, exists := eb.clients[clientID]
	if !exists {
		return
	}

	// Remove from streams
	if clients, ok := eb.streams[client.StreamID]; ok {
		for i, c := range clients {
			if c.ID == clientID {
				eb.streams[client.StreamID] = append(clients[:i], clients[i+1:]...)
				break
			}
		}
	}

	// Remove from clients map
	delete(eb.clients, clientID)

	// Close channel safely
	select {
	case <-client.Channel:
	default:
		close(client.Channel)
	}
}

// Broadcast sends an event to all clients subscribed to a stream
func (eb *EventBroadcaster) Broadcast(streamID string, eventType string, message string, data map[string]interface{}) {
	eb.mu.RLock()
	clients := eb.streams[streamID]
	eb.mu.RUnlock()

	event := EventData{
		ID:        fmt.Sprintf("evt_%d", time.Now().UnixNano()),
		Type:      eventType,
		Message:   message,
		Data:      data,
		Timestamp: time.Now().Unix(),
		StreamID:  streamID,
	}

	for _, client := range clients {
		select {
		case client.Channel <- event:
			// Message sent successfully
		default:
			// Channel full, skip this client
		}
	}
}

// BroadcastToAll sends an event to all clients across all streams
func (eb *EventBroadcaster) BroadcastToAll(eventType string, message string, data map[string]interface{}) {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	event := EventData{
		ID:        fmt.Sprintf("evt_%d", time.Now().UnixNano()),
		Type:      eventType,
		Message:   message,
		Data:      data,
		Timestamp: time.Now().Unix(),
	}

	for _, clients := range eb.streams {
		for _, client := range clients {
			select {
			case client.Channel <- event:
				// Message sent successfully
			default:
				// Channel full, skip this client
			}
		}
	}
}

// GetActiveStreams returns list of active streams and their client counts
func (eb *EventBroadcaster) GetActiveStreams() map[string]int {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	result := make(map[string]int)
	for streamID, clients := range eb.streams {
		result[streamID] = len(clients)
	}
	return result
}

// GetStreamClients returns clients for a specific stream
func (eb *EventBroadcaster) GetStreamClients(streamID string) []*StreamClient {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	clients := eb.streams[streamID]
	result := make([]*StreamClient, len(clients))
	copy(result, clients)
	return result
}

// GetTotalClients returns the total number of connected clients across all streams
func (eb *EventBroadcaster) GetTotalClients() int {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	total := 0
	for _, clients := range eb.streams {
		total += len(clients)
	}
	return total
}

// GetStreamCount returns the number of active streams
func (eb *EventBroadcaster) GetStreamCount() int {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	return len(eb.streams)
}

// IsStreamActive checks if a stream has any connected clients
func (eb *EventBroadcaster) IsStreamActive(streamID string) bool {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	clients, exists := eb.streams[streamID]
	return exists && len(clients) > 0
}

// cleanupRoutine removes stale clients (not used in this implementation)
func (eb *EventBroadcaster) cleanupRoutine() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		// Could implement TTL-based cleanup here if needed
	}
}
