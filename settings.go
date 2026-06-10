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
	ShowPipeSeparator bool   `json:"showPipeSeparator"`

	// New fields for Profiles and Film metadata
	Profile      string `json:"profile"`
	Camera       string `json:"camera"`
	Lens         string `json:"lens"`
	FocalLength  string `json:"focalLength"`
	Aperture     string `json:"aperture"`
	ShutterSpeed string `json:"shutterSpeed"`
	ISO          string `json:"iso"`
	Film         string `json:"film"`
	Developer    string `json:"developer"`
	Dilution     string `json:"dilution"`
	Temperature  string `json:"temperature"`
	Time         string `json:"time"`
	OverrideExif bool   `json:"overrideExif"`

	// Visibility toggles
	VisibilityCamera       bool `json:"visibilityCamera"`
	VisibilityLens         bool `json:"visibilityLens"`
	VisibilityFocalLength  bool `json:"visibilityFocalLength"`
	VisibilityAperture     bool `json:"visibilityAperture"`
	VisibilityShutterSpeed bool `json:"visibilityShutterSpeed"`
	VisibilityISO          bool `json:"visibilityISO"`
	VisibilityFilm         bool `json:"visibilityFilm"`
	VisibilityDeveloper    bool `json:"visibilityDeveloper"`
	VisibilityDilution     bool `json:"visibilityDilution"`
	VisibilityTemperature  bool `json:"visibilityTemperature"`
	VisibilityTime         bool `json:"visibilityTime"`
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
		ShowPipeSeparator: true,
		Profile:           "digital",
		VisibilityCamera:       true,
		VisibilityLens:         true,
		VisibilityFocalLength:  true,
		VisibilityAperture:     true,
		VisibilityShutterSpeed: true,
		VisibilityISO:          true,
		VisibilityFilm:         true,
		VisibilityDeveloper:    true,
		VisibilityDilution:     true,
		VisibilityTemperature:  true,
		VisibilityTime:         true,
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
	// Resolve symlinks for accurate comparison — plain filepath.Clean can be
	// bypassed when one of the folders is a symlink.
	if s.WatchFolder != "" && s.ExportFolder != "" {
		watchReal, errW := filepath.EvalSymlinks(filepath.Clean(s.WatchFolder))
		exportReal, errE := filepath.EvalSymlinks(filepath.Clean(s.ExportFolder))

		// If EvalSymlinks fails (e.g. folder doesn't exist yet), fall back to
		// normalized string comparison so we still catch obvious conflicts.
		if errW != nil {
			watchReal = normalizePathForCompare(s.WatchFolder)
		} else {
			watchReal = normalizePathForCompare(watchReal)
		}
		if errE != nil {
			exportReal = normalizePathForCompare(s.ExportFolder)
		} else {
			exportReal = normalizePathForCompare(exportReal)
		}

		if watchReal == exportReal {
			return "Error: Export folder cannot be the same as the Watch folder."
		}
		sep := string(filepath.Separator)
		if (watchReal == sep && strings.HasPrefix(exportReal, sep)) || strings.HasPrefix(exportReal, watchReal+sep) {
			return "Error: Export folder cannot be a subdirectory of the Watch folder."
		}
		if (exportReal == sep && strings.HasPrefix(watchReal, sep)) || strings.HasPrefix(watchReal, exportReal+sep) {
			return "Error: Watch folder cannot be a subdirectory of the Export folder."
		}
	}

	settingsMu.Lock()
	oldSettings := currentSettings
	currentSettings = s
	settingsMu.Unlock()

	if err := saveSettings(); err != nil {
		// Rollback to previous settings on persistence failure
		settingsMu.Lock()
		currentSettings = oldSettings
		settingsMu.Unlock()
		log.Println("Error saving settings:", err)
		return "Error: Failed to save settings: " + err.Error()
	}
	
	if oldSettings.WatchFolder != s.WatchFolder {
		if err := a.updateWatcher(s.WatchFolder); err != nil {
			// Rollback to previous settings
			settingsMu.Lock()
			currentSettings = oldSettings
			settingsMu.Unlock()
			if rollbackErr := saveSettings(); rollbackErr != nil {
				log.Println("Error rolling back settings file:", rollbackErr)
			}
			if watcherErr := a.updateWatcher(oldSettings.WatchFolder); watcherErr != nil {
				log.Println("Error restoring previous watcher:", watcherErr)
			}
			return "Error: Failed to start watcher: " + err.Error()
		}
	}
	return "" // Success
}
