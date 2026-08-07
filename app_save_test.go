package main

import "testing"

// ensureValidExtension
// ---------------------------------------------------------------------------

func TestEnsureValidExtension(t *testing.T) {
	tests := []struct {
		name      string
		path      string
		isPng     bool
		wantPath  string
		wantError bool
	}{
		// No extension — append
		{"no ext, jpeg", "/tmp/photo", false, "/tmp/photo.jpg", false},
		{"no ext, png", "/tmp/photo", true, "/tmp/photo.png", false},

		// Correct extension — pass through
		{"correct .jpg", "/tmp/photo.jpg", false, "/tmp/photo.jpg", false},
		{"correct .jpeg", "/tmp/photo.jpeg", false, "/tmp/photo.jpeg", false},
		{"correct .png", "/tmp/photo.png", true, "/tmp/photo.png", false},

		// Case insensitive
		{"uppercase .JPG", "/tmp/photo.JPG", false, "/tmp/photo.JPG", false},
		{"uppercase .PNG", "/tmp/photo.PNG", true, "/tmp/photo.PNG", false},

		// Wrong extension — error
		{"png with .jpg", "/tmp/photo.jpg", true, "", true},
		{"jpeg with .png", "/tmp/photo.png", false, "", true},
		{"jpeg with .bmp", "/tmp/photo.bmp", false, "", true},
		{"png with .gif", "/tmp/photo.gif", true, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ensureValidExtension(tt.path, tt.isPng)
			if tt.wantError {
				if err == nil {
					t.Errorf("ensureValidExtension(%q, %v) expected error, got nil", tt.path, tt.isPng)
				}
				return
			}
			if err != nil {
				t.Errorf("ensureValidExtension(%q, %v) unexpected error: %v", tt.path, tt.isPng, err)
				return
			}
			if got != tt.wantPath {
				t.Errorf("ensureValidExtension(%q, %v) = %q, want %q", tt.path, tt.isPng, got, tt.wantPath)
			}
		})
	}
}
