package main

import (
	"context"
	"sync"
	goruntime "runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App struct
type App struct {
	// mu protects currentImagePath for concurrent access from IPC and HTTP handler.
	mu               sync.RWMutex
	currentImagePath string

	// handler is set after initialization so SaveImage can call prepareSave.
	handler *ImageHandler

	// GUI state for dynamic system tray
	trayMu     sync.Mutex
	mainWindow *application.WebviewWindow
	sysTray    *application.SystemTray
	trayIcon   []byte
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// OnStartup is called when the app starts.
func (a *App) OnStartup() {
	// Restart watcher if configured
	settingsMu.RLock()
	watchFolder := currentSettings.WatchFolder
	settingsMu.RUnlock()
	if watchFolder != "" {
		a.updateWatcher(watchFolder)
	}
}

// OnShutdown is called at application termination
func (a *App) OnShutdown() {
	a.updateWatcher("") // This properly closes the watcher and waits for its goroutine to exit
}

// ServiceStartup implements the Wails v3 service lifecycle interface.
// Called automatically by the framework when the application starts.
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.OnStartup()
	return nil
}

// ServiceShutdown implements the Wails v3 service lifecycle interface.
// Called automatically by the framework when the application shuts down.
func (a *App) ServiceShutdown() error {
	a.OnShutdown()
	return nil
}

// SyncSystemTrayState synchronizes the system tray state with the current ResidentMode setting.
func (a *App) SyncSystemTrayState() {
	a.trayMu.Lock()
	defer a.trayMu.Unlock()

	settingsMu.RLock()
	isResident := currentSettings.ResidentMode
	settingsMu.RUnlock()

	if isResident {
		if a.sysTray != nil {
			return // Already setup
		}
		app := application.Get()
		
		trayMenu := application.NewMenu()
		trayMenu.Add("Show ExifFrame").OnClick(func(ctx *application.Context) {
			if a.mainWindow != nil {
				a.mainWindow.Show()
				a.mainWindow.Focus()
			}
		})
		trayMenu.Add("Preferences...").OnClick(func(ctx *application.Context) {
			a.OpenSettingsWindow()
		})
		trayMenu.AddSeparator()
		trayMenu.Add("Quit ExifFrame").OnClick(func(ctx *application.Context) {
			app.Quit()
		})

		systray := app.SystemTray.New()
		if goruntime.GOOS == "darwin" {
			systray.SetTemplateIcon(a.trayIcon)
		} else {
			systray.SetIcon(a.trayIcon)
		}
		systray.SetMenu(trayMenu)
		systray.SetTooltip("ExifFrame")

		systray.OnClick(func() {
			a.trayMu.Lock()
			defer a.trayMu.Unlock()
			// Skip if tray was destroyed concurrently
			if a.sysTray == nil {
				return
			}
			if a.mainWindow != nil {
				if a.mainWindow.IsVisible() {
					a.mainWindow.Hide()
				} else {
					a.mainWindow.Show()
					a.mainWindow.Focus()
				}
			}
		})
		a.sysTray = systray
	} else {
		if a.sysTray != nil {
			if a.mainWindow != nil && !a.mainWindow.IsVisible() {
				a.mainWindow.Show()
				a.mainWindow.Focus()
			}
			a.sysTray.Destroy()
			a.sysTray = nil
		}
	}
}

// HandleWindowClosing intercepts the window close event and manages the application lifecycle
// in coordination with the resident mode setting.
func (a *App) HandleWindowClosing(win *application.WebviewWindow, e *application.WindowEvent) {
	a.trayMu.Lock()

	settingsMu.RLock()
	isResident := currentSettings.ResidentMode
	settingsMu.RUnlock()

	if isResident {
		win.Hide()
		e.Cancel()
		a.trayMu.Unlock()
	} else {
		a.trayMu.Unlock()
		application.Get().Quit()
	}
}

// getCurrentImagePath returns the path of the currently loaded image in a thread-safe manner.
func (a *App) getCurrentImagePath() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.currentImagePath
}

// OpenSettingsWindow opens the settings window or focuses it if already open.
func (a *App) OpenSettingsWindow() {
	app := application.Get()

	// If the window already exists, focus it
	if win, ok := app.Window.GetByName("settings"); ok && win != nil {
		win.Show()
		win.Focus()
		return
	}

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:  "settings",
		Title: "Preferences",
		Width: 800,
		Height: 600,
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInsetUnified,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/?page=settings",
	})
}

// GetFilmRecipes returns the bundled film recipes.
// Exposed to Wails frontend.
func (a *App) GetFilmRecipes() []Recipe {
	return GetFilmRecipes()
}

