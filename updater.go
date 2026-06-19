package main

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

const (
	updateOwner         = "amemya"
	updateRepo          = "ExifFrame"
	updateCheckInterval = 4 * time.Hour
)

// InitUpdater initialises the Wails v3 built-in updater on the given app
// instance. It configures a GitHub provider pointed at the ExifFrame
// repository and enables periodic background checks.
func InitUpdater(app *application.App) {
	ghProvider, err := github.New(github.Config{
		Repository:    updateOwner + "/" + updateRepo,
		ChecksumAsset: "SHA256SUMS",
	})
	if err != nil {
		// Non-fatal: if the provider can't be constructed the app still works,
		// just without auto-update.
		log.Printf("GitHub provider creation failed: %v", err)
		return
	}

	// The Wails updater expects versions without the "v" prefix.
	ver := strings.TrimPrefix(Version, "v")

	err = app.Updater.Init(updater.Config{
		CurrentVersion: ver,
		Providers:      []updater.Provider{ghProvider},
		CheckInterval:  updateCheckInterval,
	})
	if err != nil {
		// Init can fail if called twice or if validation fails.
		// Either way the app should still function normally.
		log.Printf("Updater init failed: %v", err)
		return
	}
}

// UpdateStatus represents the current state of the updater, exposed to the frontend.
type UpdateStatus struct {
	State          string  `json:"state"`          // "idle", "checking", "available", "downloading", "ready", "error", etc.
	Version        string  `json:"version"`        // new version available (empty if none)
	ReleaseNotes   string  `json:"releaseNotes"`   // markdown release notes
	DownloadPct    float64 `json:"downloadPct"`    // 0-100 download progress
	ErrorMessage   string  `json:"errorMessage"`   // last error, if any
}

// CheckForUpdate manually triggers an update check. This replaces the old
// CheckForUpdates method that only opened the browser. Now it drives the
// full Wails updater flow.
func (a *App) CheckForUpdate() UpdateStatus {
	app := application.Get()
	if app.Updater == nil {
		return UpdateStatus{State: "idle"}
	}

	state := app.Updater.State()
	if state == updater.StateUnconfigured {
		return UpdateStatus{State: "idle"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rel, err := app.Updater.Check(ctx)
	if err != nil {
		log.Printf("Update check failed: %v", err)
		return UpdateStatus{State: "error", ErrorMessage: err.Error()}
	}
	if rel == nil {
		return UpdateStatus{State: "up-to-date"}
	}

	return UpdateStatus{
		State:        "available",
		Version:      rel.Version,
		ReleaseNotes: rel.Notes,
	}
}

// TriggerUpdate starts downloading and installing the pending update.
// Call CheckForUpdate first to populate the pending release.
func (a *App) TriggerUpdate() UpdateStatus {
	app := application.Get()
	if app.Updater == nil {
		return UpdateStatus{State: "error", ErrorMessage: "Updater not initialised"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	err := app.Updater.DownloadAndInstall(ctx)
	if err != nil {
		return UpdateStatus{State: "error", ErrorMessage: err.Error()}
	}

	return UpdateStatus{State: "ready"}
}

// RestartApp restarts the application to apply the downloaded update.
func (a *App) RestartApp() UpdateStatus {
	app := application.Get()
	if app.Updater == nil {
		return UpdateStatus{State: "error", ErrorMessage: "Updater not initialised"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := app.Updater.Restart(ctx)
	if err != nil {
		return UpdateStatus{State: "error", ErrorMessage: err.Error()}
	}

	return UpdateStatus{State: "restarting"}
}
