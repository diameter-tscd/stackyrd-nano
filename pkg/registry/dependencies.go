package registry

// Dependencies holds all infrastructure dependencies that services might need
type Dependencies struct {
	// Dynamic component store - no static declarations
	components map[string]interface{}
}

// NewDependencies creates a new dependencies container
func NewDependencies() *Dependencies {
	return &Dependencies{
		components: make(map[string]interface{}),
	}
}

// Set stores a component by name
func (d *Dependencies) Set(name string, component interface{}) {
	d.components[name] = component
}

// Get retrieves a component by name
func (d *Dependencies) Get(name string) (interface{}, bool) {
	comp, ok := d.components[name]
	return comp, ok
}

// GetAll returns all registered components
func (d *Dependencies) GetAll() map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range d.components {
		result[k] = v
	}
	return result
}

// GetTyped retrieves component with type assertion
func GetTyped[T any](d *Dependencies, name string) (T, bool) {
	var zero T

	comp, ok := d.Get(name)
	if !ok {
		return zero, false
	}

	typed, ok := comp.(T)
	return typed, ok
}
