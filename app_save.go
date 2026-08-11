package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type SaveResult struct {
	Error     string `json:"error"`
	Cancelled bool   `json:"cancelled"`
	SaveToken string `json:"saveToken"`
}

// SaveImage opens a native save dialog and prepares the save path.
// The actual binary data is received separately via HTTP POST to /api/save,
// avoiding the memory-intensive Base64 IPC transfer.
// The isPng parameter indicates whether the export format is PNG (true) or JPEG (false).
// defaultName is the pre-filled base filename for the export.
func (a *App) SaveImage(isPng bool, defaultName string) SaveResult {
	filterName := "JPEG Image"
	filterPattern := "*.jpg;*.jpeg"
	if defaultName == "" {
		defaultName = "exif-frame"
	}
	defaultFilename := defaultName + ".jpg"
	expectedMime := "image/jpeg"

	if isPng {
		filterName = "PNG Image"
		filterPattern = "*.png"
		defaultFilename = defaultName + ".png"
		expectedMime = "image/png"
	}

	savePath, err := application.Get().Dialog.SaveFile().
		SetMessage("Save ExifFrame Image").
		SetFilename(defaultFilename).
		AddFilter(filterName, filterPattern).
		PromptForSingleSelection()

	if err != nil {
		return SaveResult{Error: "Failed to open save dialog: " + err.Error()}
	}

	// User cancelled the dialog
	if savePath == "" {
		return SaveResult{Cancelled: true}
	}

	savePath, err = ensureValidExtension(savePath, isPng)
	if err != nil {
		return SaveResult{Error: err.Error()}
	}

	// Signal the HTTP handler that a save path is ready.
	// The frontend will then POST the binary data to /api/save with this token.
	if a.handler == nil {
		return SaveResult{Error: "Internal error: image handler not initialized"}
	}
	token := a.handler.prepareSave(savePath, expectedMime)

	return SaveResult{SaveToken: token}
}

// SaveAutoImage bypasses the native dialog and prepares a save token for automated background saving.
func (a *App) SaveAutoImage(isPng bool, savePath string) SaveResult {
	// Validate path is within export folder
	settingsMu.RLock()
	exportFolder := currentSettings.ExportFolder
	settingsMu.RUnlock()

	if exportFolder == "" {
		return SaveResult{Error: "Export folder is not configured"}
	}

	// Resolve symlinks to prevent path traversal attacks
	realExport, err := filepath.EvalSymlinks(filepath.Clean(exportFolder))
	if err != nil {
		return SaveResult{Error: "Failed to resolve export folder path: " + err.Error()}
	}

	// Walk up from the save directory to find the nearest existing ancestor.
	// This allows saving into not-yet-created subdirectories under ExportFolder
	// (e.g. ExportFolder/2026-05/photo.jpg where 2026-05/ doesn't exist yet).
	cleanSave := filepath.Clean(savePath)
	ancestor := filepath.Dir(cleanSave)
	for {
		if _, statErr := os.Stat(ancestor); statErr == nil {
			break
		}
		parent := filepath.Dir(ancestor)
		if parent == ancestor {
			// Reached filesystem root without finding an existing directory
			break
		}
		ancestor = parent
	}

	realAncestor, err := filepath.EvalSymlinks(ancestor)
	if err != nil {
		return SaveResult{Error: "Failed to resolve save path: " + err.Error()}
	}
	rel, err := filepath.Rel(realExport, realAncestor)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return SaveResult{Error: "Save path is outside of the allowed export folder"}
	}

	expectedMime := "image/jpeg"
	if isPng {
		expectedMime = "image/png"
	}
	if a.handler == nil {
		return SaveResult{Error: "Internal error: image handler not initialized"}
	}
	token := a.handler.prepareSave(savePath, expectedMime)
	return SaveResult{SaveToken: token}
}

// SaveBatchImage bypasses ExportFolder validation for explicit batch exports.
func (a *App) SaveBatchImage(isPng bool, exportDir string, exportName string) SaveResult {
	savePath := filepath.Join(exportDir, exportName)
	savePath, err := ensureValidExtension(savePath, isPng)
	if err != nil {
		return SaveResult{Error: err.Error()}
	}

	expectedMime := "image/jpeg"
	if isPng {
		expectedMime = "image/png"
	}
	if a.handler == nil {
		return SaveResult{Error: "Internal error: image handler not initialized"}
	}
	token := a.handler.prepareSave(savePath, expectedMime)
	return SaveResult{SaveToken: token}
}

// ensureValidExtension checks the file path and appends or validates the required extension.
func ensureValidExtension(savePath string, isPng bool) (string, error) {
	ext := strings.ToLower(filepath.Ext(savePath))
	if ext == "" {
		if isPng {
			return savePath + ".png", nil
		}
		return savePath + ".jpg", nil
	}

	if isPng && ext != ".png" {
		return "", fmt.Errorf("Invalid extension. Please save as .png")
	} else if !isPng && ext != ".jpg" && ext != ".jpeg" {
		return "", fmt.Errorf("Invalid extension. Please save as .jpg or .jpeg")
	}
	return savePath, nil
}

