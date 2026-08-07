package main

import (
	"embed"
	"log"
	"runtime"
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed build/trayicon.png
var trayIcon []byte

//go:embed all:frontend/dist
var assets embed.FS

var isQuitting atomic.Bool

func buildMenu(app *App) *application.Menu {
	appMenu := application.NewMenu()

	if runtime.GOOS == "darwin" {
		appleMenu := appMenu.AddSubmenu("ExifFrame")
		appleMenu.AddRole(application.About)
		appleMenu.AddSeparator()
		appleMenu.Add("Preferences...").SetAccelerator("CmdOrCtrl+,").OnClick(func(ctx *application.Context) {
			app.OpenSettingsWindow()
		})
		appleMenu.AddSeparator()
		appleMenu.Add("Hide ExifFrame").SetAccelerator("CmdOrCtrl+h").OnClick(func(ctx *application.Context) {
			application.Get().Hide()
		})
		appleMenu.AddRole(application.HideOthers)
		appleMenu.AddRole(application.ShowAll)
		appleMenu.AddSeparator()
		appleMenu.Add("Quit ExifFrame").SetAccelerator("CmdOrCtrl+q").OnClick(func(ctx *application.Context) {
			application.Get().Quit()
		})

		fileMenu := appMenu.AddSubmenu("File")
		fileMenu.Add("Open Files...").SetAccelerator("CmdOrCtrl+O").OnClick(func(ctx *application.Context) {
			results := app.OpenFiles()
			if len(results) > 0 && !results[0].Cancelled {
				application.Get().Event.Emit("images-opened", results)
			}
		})
		fileMenu.Add("Open Folder...").OnClick(func(ctx *application.Context) {
			results := app.OpenFolder()
			if len(results) > 0 && !results[0].Cancelled {
				application.Get().Event.Emit("images-opened", results)
			}
		})

		appMenu.AddRole(application.EditMenu)
		appMenu.AddRole(application.WindowMenu)
	} else {
		fileMenu := appMenu.AddSubmenu("File")
		fileMenu.Add("Open Files...").SetAccelerator("CmdOrCtrl+O").OnClick(func(ctx *application.Context) {
			results := app.OpenFiles()
			if len(results) > 0 && !results[0].Cancelled {
				application.Get().Event.Emit("images-opened", results)
			}
		})
		fileMenu.Add("Open Folder...").OnClick(func(ctx *application.Context) {
			results := app.OpenFolder()
			if len(results) > 0 && !results[0].Cancelled {
				application.Get().Event.Emit("images-opened", results)
			}
		})
		fileMenu.AddSeparator()
		fileMenu.Add("Preferences...").SetAccelerator("CmdOrCtrl+,").OnClick(func(ctx *application.Context) {
			app.OpenSettingsWindow()
		})
	}

	return appMenu
}

func main() {
	appStruct := NewApp()
	handler := NewImageHandler(appStruct)
	appStruct.handler = handler

	// Read settings (if needed later)
	// settingsMu.RLock()
	// residentMode := currentSettings.ResidentMode
	// settingsMu.RUnlock()

	app := application.New(application.Options{
		Name:        "ExifFrame",
		Description: "ExifFrame",
		Services: []application.Service{
			application.NewService(appStruct),
		},
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: handler.Middleware,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		ShouldQuit: func() bool {
			isQuitting.Store(true)
			return true
		},
	})
	app.Menu.SetApplicationMenu(buildMenu(appStruct))

	// Initialise the in-app updater (GitHub-backed, with periodic checks).
	InitUpdater(app)

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "ExifFrame",
		Width:  1024,
		Height: 768,
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInsetUnified,
		},
		Windows: application.WindowsWindow{
			Menu: buildMenu(appStruct),
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
		StartState:       application.WindowStateMaximised,
		EnableFileDrop:   true,
	})

	win.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		if len(files) > 0 {
			application.Get().Event.Emit("files-dropped", files)
		}
	})

	appStruct.mainWindow = win
	appStruct.trayIcon = trayIcon

	// --- System Tray (Resident Mode) ---
	// Intercept window close: hide instead of destroy, unless setting changed dynamically.
	win.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if isQuitting.Load() {
			return
		}

		settingsMu.RLock()
		isResident := currentSettings.ResidentMode
		settingsMu.RUnlock()

		if isResident {
			win.Hide()
			e.Cancel()
		} else {
			application.Get().Quit()
		}
	})

	appStruct.SyncSystemTrayState()

	err := app.Run()
	if err != nil {
		log.Fatal("Error:", err)
	}
}
