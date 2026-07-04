package main

import (
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
)

func TestNormalizePathForCompare(t *testing.T) {
	isCaseInsensitive := goruntime.GOOS == "darwin" || goruntime.GOOS == "windows"

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Clean path",
			input:    "/path/to/folder//subfolder/../",
			expected: "/path/to/folder",
		},
		{
			name:     "Already clean",
			input:    "/usr/local/bin",
			expected: "/usr/local/bin",
		},
		{
			name:     "Trailing separator",
			input:    "/path/to/folder/",
			expected: "/path/to/folder",
		},
	}

	// Case handling tests — expected differs by OS.
	if isCaseInsensitive {
		tests = append(tests, struct {
			name     string
			input    string
			expected string
		}{
			name:     "Case insensitive OS lowercases",
			input:    "/Path/To/Folder",
			expected: "/path/to/folder",
		})
	} else {
		tests = append(tests, struct {
			name     string
			input    string
			expected string
		}{
			name:     "Case sensitive OS preserves case",
			input:    "/Path/To/Folder",
			expected: "/Path/To/Folder",
		})
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := normalizePathForCompare(tt.input)
			if result != tt.expected {
				t.Errorf("normalizePathForCompare(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// SaveSettings folder validation
// ---------------------------------------------------------------------------

// TestSaveSettings_FolderValidation tests the folder hierarchy checks in
// App.SaveSettings. We use real temp directories so that filepath.EvalSymlinks
// resolves correctly. The App has no handler and an empty WatchFolder, so the
// watcher code path is safely skipped (WatchFolder doesn't change).
func TestSaveSettings_FolderValidation(t *testing.T) {
	// Create a directory tree:
	//   root/
	//     watch/
	//     export/
	//     watch/child/
	base := t.TempDir()
	watchDir := filepath.Join(base, "watch")
	exportDir := filepath.Join(base, "export")
	childDir := filepath.Join(watchDir, "child")
	if err := os.MkdirAll(childDir, 0755); err != nil {
		t.Fatalf("failed to create childDir: %v", err)
	}
	if err := os.MkdirAll(exportDir, 0755); err != nil {
		t.Fatalf("failed to create exportDir: %v", err)
	}

	tests := []struct {
		name        string
		watch       string
		export      string
		wantErrSub  string // substring expected in the error; empty = success
	}{
		{
			name:       "same folder",
			watch:      watchDir,
			export:     watchDir,
			wantErrSub: "same as the Watch folder",
		},
		{
			name:       "export is child of watch",
			watch:      watchDir,
			export:     childDir,
			wantErrSub: "subdirectory of the Watch folder",
		},
		{
			name:       "watch is child of export",
			watch:      childDir,
			export:     watchDir,
			wantErrSub: "subdirectory of the Export folder",
		},
		{
			name:       "sibling directories (ok)",
			watch:      watchDir,
			export:     exportDir,
			wantErrSub: "",
		},
		{
			name:       "both empty (ok)",
			watch:      "",
			export:     "",
			wantErrSub: "",
		},
		{
			name:       "only watch set (ok)",
			watch:      watchDir,
			export:     "",
			wantErrSub: "",
		},
		{
			name:       "only export set (ok)",
			watch:      "",
			export:     exportDir,
			wantErrSub: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := &App{}

			// Temporarily override the settingsFile so saveSettings() doesn't
			// clobber the user's real settings and doesn't fail.
			origFile := settingsFile
			tmpFile := filepath.Join(t.TempDir(), "settings.json")
			settingsFile = tmpFile
			defer func() { settingsFile = origFile }()

			// Ensure currentSettings WatchFolder is blank so the watcher
			// path in SaveSettings is never triggered (no handler needed).
			settingsMu.Lock()
			oldSettings := currentSettings
			currentSettings.WatchFolder = ""
			settingsMu.Unlock()
			defer func() {
				settingsMu.Lock()
				currentSettings = oldSettings
				settingsMu.Unlock()
			}()

			s := Settings{
				WatchFolder:  tt.watch,
				ExportFolder: tt.export,
			}

			result := app.SaveSettings(s)

			if tt.wantErrSub == "" {
				if result != "" {
					t.Errorf("expected success, got error: %q", result)
				}
			} else {
				if !strings.Contains(result, tt.wantErrSub) {
					t.Errorf("expected error containing %q, got %q", tt.wantErrSub, result)
				}
			}
		})
	}
}

