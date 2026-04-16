package test

import (
	"testing"
)

// TestHelper provides common testing utilities
type TestHelper struct {
	T *testing.T
}

// NewTestHelper creates a new test helper
func NewTestHelper(t *testing.T) *TestHelper {
	return &TestHelper{T: t}
}

// AssertError checks if an error matches expectations
func (th *TestHelper) AssertError(t *testing.T, err error, wantErr bool) {
	if (err != nil) != wantErr {
		t.Errorf("error = %v, wantErr %v", err, wantErr)
	}
}

// AssertEqual checks if two values are equal
func (th *TestHelper) AssertEqual(t *testing.T, got, want any) {
	if got != want {
		t.Errorf("got %v, want %v", got, want)
	}
}

// AssertNotNil checks if a value is not nil
func (th *TestHelper) AssertNotNil(t *testing.T, got any) {
	if got == nil {
		t.Errorf("expected non-nil value")
	}
}
