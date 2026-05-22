package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
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
	if err == nil {
		appDir := filepath.Join(configDir, "ExifFrame")
		os.MkdirAll(appDir, 0755)
		settingsFile = filepath.Join(appDir, "settings.json")
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
		var temp Settings
		if err := json.Unmarshal(data, &temp); err != nil {
			log.Println("Error parsing settings.json:", err)
			return
		}
		settingsMu.Lock()
		currentSettings = temp
		settingsMu.Unlock()
	}
}

func saveSettings() {
	if settingsFile == "" {
		return
	}
	settingsMu.RLock()
	data, err := json.MarshalIndent(currentSettings, "", "  ")
	settingsMu.RUnlock()
	
	if err == nil {
		if err := os.WriteFile(settingsFile, data, 0644); err != nil {
			log.Println("Error saving settings to disk:", err)
		}
	} else {
		log.Println("Error marshaling settings:", err)
	}
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
		watchClean := filepath.Clean(s.WatchFolder)
		exportClean := filepath.Clean(s.ExportFolder)
		if watchClean == exportClean {
			return "Error: Export folder cannot be the same as the Watch folder."
		}
		if strings.HasPrefix(exportClean, watchClean+string(filepath.Separator)) {
			return "Error: Export folder cannot be a subdirectory of the Watch folder."
		}
		if strings.HasPrefix(watchClean, exportClean+string(filepath.Separator)) {
			return "Error: Watch folder cannot be a subdirectory of the Export folder."
		}
	}

	settingsMu.Lock()
	oldWatch := currentSettings.WatchFolder
	currentSettings = s
	settingsMu.Unlock()
	saveSettings()
	
	if oldWatch != s.WatchFolder {
		a.updateWatcher(s.WatchFolder)
	}
	return "" // Success
}
