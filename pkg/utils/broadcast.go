package utils

import (
	"fmt"
	"strconv"
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
	return &EventBroadcaster{
		streams:   make(map[string][]*StreamClient),
		clients:   make(map[string]*StreamClient),
		nextID:    1,
		clientTTL: 24 * time.Hour, // Clients automatically removed after 24 hours
	}
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

	// Remove from clients map and close channel
	delete(eb.clients, clientID)
	close(client.Channel)
}

// Broadcast sends an event to all clients subscribed to a stream
func (eb *EventBroadcaster) Broadcast(streamID string, eventType string, message string, data map[string]interface{}) {
	if eventType == "" {
		eventType = "default"
	}

	eb.mu.RLock()
	clients := eb.streams[streamID]
	count := len(clients)
	eb.mu.RUnlock()

	if count == 0 {
		return // fast-exit: nothing to do
	}

	event := EventData{
		ID:        strconv.FormatInt(time.Now().UnixNano(), 10),
		Type:      eventType,
		Message:   message,
		Data:      data,
		Timestamp: time.Now().Unix(),
		StreamID:  streamID,
	}

	for _, client := range clients {
		select {
		case client.Channel <- event:
		default:
			// Channel full — drop this message for this client
		}
	}
}

// BroadcastToAll sends an event to all clients across all streams
func (eb *EventBroadcaster) BroadcastToAll(eventType string, message string, data map[string]interface{}) {
	if eventType == "" {
		eventType = "default"
	}

	eb.mu.RLock()
	total := len(eb.clients)
	if total == 0 {
		eb.mu.RUnlock()
		return // fast-exit: nothing to do
	}

	type target struct {
		client  *StreamClient
		streams map[string][]*StreamClient
	}
	// Snapshot both maps under the read-lock; send after releasing
	clientList := make(map[string]*StreamClient, total)
	streamSnap := make(map[string][]*StreamClient, len(eb.streams))
	for k, v := range eb.clients {
		clientList[k] = v
	}
	for k, v := range eb.streams {
		streamSnap[k] = v
	}
	eb.mu.RUnlock()

	event := EventData{
		ID:        strconv.FormatInt(time.Now().UnixNano(), 10),
		Type:      eventType,
		Message:   message,
		Data:      data,
		Timestamp: time.Now().Unix(),
	}

	// Collect unique clients from all streams
	seen := make(map[*StreamClient]struct{})
	for _, clients := range streamSnap {
		for _, client := range clients {
			seen[client] = struct{}{}
		}
	}

	for client := range seen {
		select {
		case client.Channel <- event:
		default:
			// Channel full — drop
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
