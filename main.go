package main

import (
	"embed"
	"log"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func buildMenu(app *App) *application.Menu {
	appMenu := application.NewMenu()

	if runtime.GOOS == "darwin" {
		appleMenu := appMenu.AddSubmenu("ExifFrame")
		appleMenu.Add("About ExifFrame").OnClick(func(ctx *application.Context) {})
		appleMenu.AddSeparator()
		appleMenu.Add("Preferences...").SetAccelerator("CmdOrCtrl+,").OnClick(func(ctx *application.Context) {
			application.Get().Show()
			application.Get().Event.Emit("open_settings")
		})
		appleMenu.AddSeparator()
		appleMenu.Add("Hide ExifFrame").SetAccelerator("CmdOrCtrl+h").OnClick(func(ctx *application.Context) {
			application.Get().Hide()
		})
		appleMenu.Add("Hide Others").SetAccelerator("OptionOrAlt+h").OnClick(func(ctx *application.Context) {})
		appleMenu.Add("Show All").OnClick(func(ctx *application.Context) {
			application.Get().Show()
		})
		appleMenu.AddSeparator()
		appleMenu.Add("Quit ExifFrame").SetAccelerator("CmdOrCtrl+q").OnClick(func(ctx *application.Context) {
			application.Get().Quit()
		})

		appMenu.AddRole(application.EditMenu)
		appMenu.AddRole(application.WindowMenu)
	} else {
		fileMenu := appMenu.AddSubmenu("File")
		fileMenu.Add("Preferences...").SetAccelerator("CmdOrCtrl+,").OnClick(func(ctx *application.Context) {
			application.Get().Show()
			application.Get().Event.Emit("open_settings")
		})
	}

	return appMenu
}

func main() {
	appStruct := NewApp()
	handler := NewImageHandler(appStruct)
	appStruct.handler = handler

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
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})
	app.Menu.SetApplicationMenu(buildMenu(appStruct))

	// Let the App struct handle its own startup/shutdown via Wails Service interfaces if supported,
	// or we can just call startup directly for now.
	go func() {
		// Temporary workaround for startup hook
		appStruct.OnStartup()
	}()

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "ExifFrame",
		Width:  1024,
		Height: 768,
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
		// In v2 WindowStartState: options.Maximised was used.
		// Wails v3 equivalent might be to call window.Maximise() after creation.
	}).Maximise()

	err := app.Run()
	if err != nil {
		log.Fatal("Error:", err)
	}
}
