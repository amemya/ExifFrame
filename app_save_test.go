package main

import (
	"path/filepath"
	"runtime"
	"testing"
)

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

// SaveBatchImage Validation
// ---------------------------------------------------------------------------

func TestSaveBatchImage_Validation(t *testing.T) {
	app := &App{
		handler: newTestHandler(),
	}

	type testCase struct {
		name       string
		exportName string
		isPng      bool
		wantError  string
	}

	tests := []testCase{
		{"valid name", "image.jpg", false, ""},
		{"valid name png", "photo.png", true, ""},
		{"empty string", "", false, "Invalid export name"},
		{"dot", ".", false, "Invalid export name"},
		{"dot dot", "..", false, "Invalid export name"},
		{"path traversal", "../outside.jpg", false, "Invalid export name"},
		{"path traversal forward slash", "dir/image.jpg", false, "Invalid export name"},
		{"path traversal backslash", "dir\\image.jpg", false, "Invalid export name"},
		{"absolute path unix", "/etc/passwd", false, "Invalid export name"},
		{"absolute path windows", "C:\\Windows\\system.ini", false, "Invalid export name"},
		{"nul byte", "image\x00.jpg", false, "Invalid export name"},
		{"valid name but wrong ext png", "image.jpg", true, "Invalid extension. Please save as .png"},
	}

	if runtime.GOOS == "windows" {
		tests = append(tests,
			testCase{"windows reserved COM1", "COM1", false, "Invalid export name"},
			testCase{"windows reserved LPT1", "LPT1", false, "Invalid export name"},
			testCase{"windows drive relative", "C:foo.jpg", false, "Invalid export name"},
			testCase{"windows alternate data stream", "foo:bar.jpg", false, "Invalid export name"},
		)
	} else {
		tests = append(tests,
			testCase{"windows reserved COM1 on unix", "COM1", false, ""},
			testCase{"windows reserved LPT1 on unix", "LPT1", false, ""},
			testCase{"windows drive relative on unix (now blocked universally)", "C:foo.jpg", false, "Invalid export name"},
			testCase{"windows alternate data stream on unix (now blocked universally)", "foo:bar.jpg", false, "Invalid export name"},
		)
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := app.SaveBatchImage(tt.isPng, "/tmp", tt.exportName)
			
			if res.Error != tt.wantError {
				t.Errorf("expected error %q, got: %q", tt.wantError, res.Error)
			}

			if tt.wantError == "" && res.SaveToken == "" {
				t.Errorf("expected valid SaveToken, got empty string")
			}
		})
	}
}

// SaveAutoImage Validation
// ---------------------------------------------------------------------------

func TestSaveAutoImage_Validation(t *testing.T) {

	exportDir := t.TempDir()

	settingsMu.Lock()
	oldSettings := currentSettings
	currentSettings.ExportFolder = exportDir
	settingsMu.Unlock()
	defer func() {
		settingsMu.Lock()
		currentSettings = oldSettings
		settingsMu.Unlock()
	}()

	type testCase struct {
		name         string
		savePath     string
		isPng        bool
		wantError    string
		wantFinalExt string
		wantMime     string
	}

	tests := []testCase{
		{"valid path", filepath.Join(exportDir, "image.jpg"), false, "", ".jpg", "image/jpeg"},
		{"valid path png", filepath.Join(exportDir, "photo.png"), true, "", ".png", "image/png"},
		{"no extension jpeg", filepath.Join(exportDir, "image"), false, "", ".jpg", "image/jpeg"},
		{"no extension png", filepath.Join(exportDir, "photo"), true, "", ".png", "image/png"},
		{"valid path but wrong ext png", filepath.Join(exportDir, "image.jpg"), true, "Invalid extension. Please save as .png", "", ""},
		{"valid path but wrong ext jpeg", filepath.Join(exportDir, "photo.png"), false, "Invalid extension. Please save as .jpg or .jpeg", "", ""},
		{"non-existent sub directory", filepath.Join(exportDir, "2026-05", "photo"), false, "", ".jpg", "image/jpeg"},
		{"path traversal escape", filepath.Join(exportDir, "..", "outside.jpg"), false, "Save path is outside of the allowed export folder", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := &App{
				handler: newTestHandler(),
			}

			res := app.SaveAutoImage(tt.isPng, tt.savePath)
			
			if res.Error != tt.wantError {
				t.Errorf("expected error %q, got: %q", tt.wantError, res.Error)
			}

			if tt.wantError == "" {
				if res.SaveToken == "" {
					t.Fatalf("expected valid SaveToken, got empty string")
				}
				
				app.handler.saveMu.Lock()
				session, ok := app.handler.saveSessions[res.SaveToken]
				app.handler.saveMu.Unlock()
				
				if !ok {
					t.Fatalf("session for token %q not found", res.SaveToken)
				}
				if filepath.Ext(session.path) != tt.wantFinalExt {
					t.Errorf("expected final extension %q, got %q (path: %s)", tt.wantFinalExt, filepath.Ext(session.path), session.path)
				}
				if session.mime != tt.wantMime {
					t.Errorf("expected mime %q, got %q", tt.wantMime, session.mime)
				}
			} else {
				if res.SaveToken != "" {
					t.Errorf("expected empty token on error, got %q", res.SaveToken)
				}
				
				app.handler.saveMu.Lock()
				count := len(app.handler.saveSessions)
				app.handler.saveMu.Unlock()
				
				if count != 0 {
					t.Errorf("expected prepareSave not to be called, but saveSessions has %d entries", count)
				}
			}
		})
	}
}
