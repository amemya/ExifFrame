package main

import (
	"embed"
	"runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

// buildMenu constructs the application menu
func buildMenu(app *App) *menu.Menu {
	AppMenu := menu.NewMenu()
	if runtime.GOOS == "darwin" {
		// Manually construct the Application Menu (ExifFrame) to allow injecting Preferences
		appMenu := menu.NewMenu()
		appMenu.AddText("About ExifFrame", nil, func(_ *menu.CallbackData) {})
		appMenu.AddSeparator()
		appMenu.AddText("Preferences...", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
			if app.ctx != nil {
				wailsruntime.WindowUnminimise(app.ctx)
				wailsruntime.WindowShow(app.ctx)
				wailsruntime.EventsEmit(app.ctx, "open_settings")
			}
		})
		appMenu.AddSeparator()
		appMenu.AddText("Hide ExifFrame", keys.CmdOrCtrl("h"), func(_ *menu.CallbackData) {
			if app.ctx != nil {
				wailsruntime.WindowHide(app.ctx)
			}
		})
		// Dummy item for standard Mac UI completeness
		appMenu.AddText("Hide Others", keys.OptionOrAlt("h"), func(_ *menu.CallbackData) {})
		appMenu.AddText("Show All", nil, func(_ *menu.CallbackData) {
			if app.ctx != nil {
				wailsruntime.WindowShow(app.ctx)
			}
		})
		appMenu.AddSeparator()
		appMenu.AddText("Quit ExifFrame", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
			if app.ctx != nil {
				wailsruntime.Quit(app.ctx)
			}
		})

		// macOS uses the first menu as the Application Menu and renames it to the App Name natively
		AppMenu.Append(menu.SubMenu("ExifFrame", appMenu))

		AppMenu.Append(menu.EditMenu())
		AppMenu.Append(menu.WindowMenu())
	} else {
		prefsMenu := AppMenu.AddSubmenu("File")
		prefsMenu.AddText("Preferences...", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
			if app.ctx != nil {
				wailsruntime.WindowUnminimise(app.ctx)
				wailsruntime.WindowShow(app.ctx)
				wailsruntime.EventsEmit(app.ctx, "open_settings")
			}
		})
	}
	return AppMenu
}

func main() {
	// Create an instance of the app structure
	app := NewApp()
	handler := NewImageHandler(app)
	app.handler = handler

	// Setup application menu
	AppMenu := buildMenu(app)

	// Create application with options
	err := wails.Run(&options.App{
		Title:            "ExifFrame",
		Width:            1024,
		Height:           768,
		WindowStartState: options.Maximised,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: handler.Middleware,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
		},
		Menu:             AppMenu,
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
