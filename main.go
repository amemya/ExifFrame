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

		appMenu.AddRole(application.EditMenu)
		appMenu.AddRole(application.WindowMenu)
	} else {
		fileMenu := appMenu.AddSubmenu("File")
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

	app.Window.NewWithOptions(application.WebviewWindowOptions{
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
	})

	err := app.Run()
	if err != nil {
		log.Fatal("Error:", err)
	}
}
