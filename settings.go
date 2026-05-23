package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
)

type Settings struct {
	WatchFolder       string `json:"watchFolder"`
	ExportFolder      string `json:"exportFolder"`
	AspectRatioPreset string `json:"aspectRatioPreset"`
	CustomRatioW      int    `json:"customRatioW"`
	CustomRatioH      int    `json:"customRatioH"`
	Orientation       string `json:"orientation"`
	Alignment         string `json:"alignment"`
}

var (
	settingsFile string
	settingsMu   sync.RWMutex
	currentSettings Settings
)

func init() {
	configDir, err := os.UserConfigDir()
	if err != nil {
		log.Println("Warning: could not get config dir:", err)
	} else {
		appDir := filepath.Join(configDir, "ExifFrame")
		if err := os.MkdirAll(appDir, 0755); err != nil {
			log.Println("Warning: could not create config dir:", err)
		} else {
			settingsFile = filepath.Join(appDir, "settings.json")
		}
	}
	
	// Set defaults
	currentSettings = Settings{
		AspectRatioPreset: "4300:3618",
		CustomRatioW:      4300,
		CustomRatioH:      3618,
		Orientation:       "landscape",
		Alignment:         "top",
	}
	loadSettings()
}

func loadSettings() {
	if settingsFile == "" {
		return
	}
	data, err := os.ReadFile(settingsFile)
	if err == nil {
		// Initialize temp with current defaults so that fields not present
		// in the JSON file retain their default values.
		temp := currentSettings
		if err := json.Unmarshal(data, &temp); err != nil {
			log.Println("Error parsing settings.json:", err)
			return
		}
		settingsMu.Lock()
		currentSettings = temp
		settingsMu.Unlock()
	}
}

func saveSettings() error {
	if settingsFile == "" {
		return fmt.Errorf("settings file path is not configured")
	}
	settingsMu.RLock()
	data, err := json.MarshalIndent(currentSettings, "", "  ")
	settingsMu.RUnlock()
	
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}
	if err := os.WriteFile(settingsFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write settings to disk: %w", err)
	}
	return nil
}

// normalizePathForCompare normalizes a path for comparison.
// On case-insensitive filesystems (macOS, Windows), it lowercases the path.
func normalizePathForCompare(path string) string {
	cleaned := filepath.Clean(path)
	if goruntime.GOOS == "darwin" || goruntime.GOOS == "windows" {
		return strings.ToLower(cleaned)
	}
	return cleaned
}

// GetSettings is called from frontend to retrieve current settings
func (a *App) GetSettings() Settings {
	settingsMu.RLock()
	defer settingsMu.RUnlock()
	return currentSettings
}

// SaveSettings is called from frontend to save settings and restart watcher if needed
func (a *App) SaveSettings(s Settings) string {
	// Validate folder hierarchy to prevent infinite loop (Task 9)
	if s.WatchFolder != "" && s.ExportFolder != "" {
		watchNorm := normalizePathForCompare(s.WatchFolder)
		exportNorm := normalizePathForCompare(s.ExportFolder)
		if watchNorm == exportNorm {
			return "Error: Export folder cannot be the same as the Watch folder."
		}
		if strings.HasPrefix(exportNorm, watchNorm+string(filepath.Separator)) {
			return "Error: Export folder cannot be a subdirectory of the Watch folder."
		}
		if strings.HasPrefix(watchNorm, exportNorm+string(filepath.Separator)) {
			return "Error: Watch folder cannot be a subdirectory of the Export folder."
		}
	}

	settingsMu.Lock()
	oldWatch := currentSettings.WatchFolder
	currentSettings = s
	settingsMu.Unlock()

	if err := saveSettings(); err != nil {
		log.Println("Error saving settings:", err)
		return "Error: Failed to save settings: " + err.Error()
	}
	
	if oldWatch != s.WatchFolder {
		a.updateWatcher(s.WatchFolder)
	}
	return "" // Success
}
