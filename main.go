package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()
	handler := NewImageHandler(app)
	app.handler = handler

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
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
