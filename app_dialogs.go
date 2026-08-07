package main

import (
	"log"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// OpenImage opens a native file dialog, reads EXIF metadata, and returns
// an HTTP URL for the frontend to fetch the image via the AssetServer Handler.
// The image bytes are NOT transferred over IPC — only metadata and the URL.
func (a *App) OpenImage() ExifResult {
	filePath, err := application.Get().Dialog.OpenFile().
		SetTitle("Select a Photo").
		AddFilter("Images", "*.jpg;*.jpeg;*.png").
		PromptForSingleSelection()
	if err != nil {
		return ExifResult{Error: err.Error()}
	}
	if filePath == "" {
		return ExifResult{Cancelled: true} // user cancelled
	}

	return a.ProcessImageFile(filePath)
}

// OpenImages opens a native file dialog for multiple files or directories, reads EXIF metadata, and returns
// a list of HTTP URLs and metadata for the frontend.
func (a *App) OpenImages() []ExifResult {
	filePaths, err := application.Get().Dialog.OpenFile().
		SetTitle("Select Photos or Folders").
		AddFilter("Images", "*.jpg;*.jpeg;*.png").
		CanChooseDirectories(true).
		CanChooseFiles(true).
		PromptForMultipleSelection()
	if err != nil {
		return []ExifResult{{Error: err.Error()}}
	}
	if len(filePaths) == 0 {
		return []ExifResult{{Cancelled: true}}
	}

	return a.ProcessPaths(filePaths)
}

// OpenFiles opens a native file dialog for multiple files, reads EXIF metadata, and returns
// a list of HTTP URLs and metadata for the frontend.
func (a *App) OpenFiles() []ExifResult {
	filePaths, err := application.Get().Dialog.OpenFile().
		SetTitle("Select Photos").
		AddFilter("Images", "*.jpg;*.jpeg;*.png").
		CanChooseDirectories(false).
		CanChooseFiles(true).
		PromptForMultipleSelection()
	if err != nil {
		return []ExifResult{{Error: err.Error()}}
	}
	if len(filePaths) == 0 {
		return []ExifResult{{Cancelled: true}}
	}

	return a.ProcessPaths(filePaths)
}

// OpenFolder opens a native directory dialog and processes all valid images within.
func (a *App) OpenFolder() []ExifResult {
	folderPath, err := application.Get().Dialog.OpenFile().
		SetTitle("Select Folder").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
	if err != nil {
		return []ExifResult{{Error: err.Error()}}
	}
	if folderPath == "" {
		return []ExifResult{{Cancelled: true}} // user cancelled
	}

	return a.ProcessPaths([]string{folderPath})
}

// SelectWatchFolder opens a directory dialog to pick a watch folder
func (a *App) SelectWatchFolder() string {
	path, err := application.Get().Dialog.OpenFile().
		SetTitle("Select Watch Folder").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
	if err != nil {
		log.Println("Error opening directory dialog:", err)
		return ""
	}
	return path
}

// SelectExportFolder opens a directory dialog to pick an export folder
func (a *App) SelectExportFolder() string {
	path, err := application.Get().Dialog.OpenFile().
		SetTitle("Select Export Folder").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
	if err != nil {
		log.Println("Error opening directory dialog:", err)
		return ""
	}
	return path
}

