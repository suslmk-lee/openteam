package unit_test

import (
	"testing"
)

// TestBasicArithmetic tests basic arithmetic operations
func TestBasicArithmetic(t *testing.T) {
	tests := []struct {
		name     string
		a, b     int
		want     int
	}{
		{
			name: "addition of positive numbers",
			a:    1,
			b:    2,
			want: 3,
		},
		{
			name: "subtraction",
			a:    5,
			b:    3,
			want: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.a + tt.b
			if got != tt.want {
				t.Errorf("got %d, want %d", got, tt.want)
			}
		})
	}
}

// TestStringOperations tests string operations
func TestStringOperations(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantLen int
	}{
		{
			name:    "empty string",
			input:   "",
			wantLen: 0,
		},
		{
			name:    "hello world",
			input:   "Hello, World!",
			wantLen: 13,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := len(tt.input)
			if got != tt.wantLen {
				t.Errorf("got len %d, want %d", got, tt.wantLen)
			}
		})
	}
}
