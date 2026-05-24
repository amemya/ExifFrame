package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rwcarlsen/goexif/exif"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	reXmpModel    = regexp.MustCompile(`tiff:Model="([^"]+)"`)
	reXmpProfile  = regexp.MustCompile(`crs:CameraProfile="([^"]+)"`)
	reXmpLens     = regexp.MustCompile(`aux:Lens="([^"]+)"`)
	reXmpExifLens = regexp.MustCompile(`exifEX:LensModel="([^"]+)"`)
	reXmpFocal    = regexp.MustCompile(`exif:FocalLength="([^"]+)"`)
	reXmpFNumber  = regexp.MustCompile(`exif:FNumber="([^"]+)"`)
	reXmpExposure = regexp.MustCompile(`exif:ExposureTime="([^"]+)"`)
	reXmpISO      = regexp.MustCompile(`(?s)<exif:ISOSpeedRatings>.*?<rdf:li>(\d+)</rdf:li>`)
)

// App struct
type App struct {
	ctx context.Context

	// mu protects currentImagePath for concurrent access from IPC and HTTP handler.
	mu               sync.RWMutex
	currentImagePath string

	// handler is set after initialization so SaveImage can call prepareSave.
	handler *ImageHandler
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Restart watcher if configured
	settingsMu.RLock()
	watchFolder := currentSettings.WatchFolder
	settingsMu.RUnlock()
	if watchFolder != "" {
		a.updateWatcher(watchFolder)
	}
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	a.updateWatcher("") // This properly closes the watcher and waits for its goroutine to exit
}

// getCurrentImagePath returns the path of the currently loaded image in a thread-safe manner.
func (a *App) getCurrentImagePath() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.currentImagePath
}

type ExifResult struct {
	ImageURL     string `json:"imageURL"`
	MimeType     string `json:"mimeType"`
	Camera       string `json:"camera"`
	Lens         string `json:"lens"`
	FocalLength  string `json:"focalLength"`
	Aperture     string `json:"aperture"`
	ShutterSpeed string `json:"shutterSpeed"`
	ISO          string `json:"iso"`
	Error        string `json:"error"`
	Cancelled    bool   `json:"cancelled"`
	FilePath     string `json:"filePath"`
}

// OpenImage opens a native file dialog, reads EXIF metadata, and returns
// an HTTP URL for the frontend to fetch the image via the AssetServer Handler.
// The image bytes are NOT transferred over IPC — only metadata and the URL.
func (a *App) OpenImage() ExifResult {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a Photo",
		Filters: []runtime.FileFilter{
			{DisplayName: "Images", Pattern: "*.jpg;*.jpeg;*.png"},
		},
	})
	if err != nil {
		return ExifResult{Error: err.Error()}
	}
	if filePath == "" {
		return ExifResult{Cancelled: true} // user cancelled
	}

	return a.processImageFile(filePath)
}

// processImageFile reads a file, validates it, and extracts EXIF
func (a *App) processImageFile(filePath string) ExifResult {
	const maxFileSize = 100 * 1024 * 1024 // 100 MB
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return ExifResult{Error: "Failed to stat file: " + err.Error()}
	}
	if fileInfo.Size() > maxFileSize {
		return ExifResult{Error: fmt.Sprintf("File is too large (max 100MB): %d bytes", fileInfo.Size())}
	}

	fileBytes, err := os.ReadFile(filePath)
	if err != nil {
		return ExifResult{Error: "Failed to read file: " + err.Error()}
	}

	mimeType := http.DetectContentType(fileBytes)
	if mimeType != "image/jpeg" && mimeType != "image/png" {
		return ExifResult{Error: "Invalid file: selected file must be a JPG or PNG image."}
	}

	return a.doOpenImage(filePath, fileBytes, mimeType)
}

func (a *App) doOpenImage(filePath string, fileBytes []byte, mimeType string) ExifResult {
	// Store the file path for the HTTP handler to serve later.
	a.mu.Lock()
	a.currentImagePath = filePath
	a.mu.Unlock()

	// Cache-busting timestamp ensures the browser fetches the new image.
	result := ExifResult{
		ImageURL: fmt.Sprintf("/api/image?t=%d", time.Now().UnixNano()),
		MimeType: mimeType,
		FilePath: filePath,
	}

	// Parse EXIF
	reader := bytes.NewReader(fileBytes)
	x, err := exif.Decode(reader)
	if err == nil {
		if cam, err := x.Get(exif.Model); err == nil {
			result.Camera, _ = cam.StringVal()
		}
		if lens, err := x.Get(exif.LensModel); err == nil {
			result.Lens, _ = lens.StringVal()
		}

		if foc, err := x.Get(exif.FocalLength); err == nil {
			num, den, _ := foc.Rat2(0)
			result.FocalLength = formatFocalLength(num, den)
		}
		if fno, err := x.Get(exif.FNumber); err == nil {
			num, den, _ := fno.Rat2(0)
			result.Aperture = formatAperture(num, den)
		}
		if ss, err := x.Get(exif.ExposureTime); err == nil {
			num, den, _ := ss.Rat2(0)
			result.ShutterSpeed = formatShutterSpeed(num, den)
		}
		if iso, err := x.Get(exif.ISOSpeedRatings); err == nil {
			result.ISO = "ISO" + iso.String()
		}
	}

	// Adobe PNG/XMP Fallback (Extract metadata directly from raw XMP block)
	var xmpData []byte
	const xmpStartTag = "<x:xmpmeta"
	const xmpEndTag = "</x:xmpmeta>"

	if start := bytes.Index(fileBytes, []byte(xmpStartTag)); start != -1 {
		if end := bytes.Index(fileBytes[start:], []byte(xmpEndTag)); end != -1 {
			xmpData = fileBytes[start : start+end+len(xmpEndTag)]
		}
	}

	if result.Camera == "" {
		result.Camera = extractXMPString(xmpData, reXmpModel)
		if result.Camera == "" {
			// Fallback to crs:CameraProfile
			result.Camera = extractXMPString(xmpData, reXmpProfile)
		}
	}
	if result.Lens == "" {
		result.Lens = extractXMPString(xmpData, reXmpLens)
		if result.Lens == "" {
			result.Lens = extractXMPString(xmpData, reXmpExifLens)
		}
	}
	if result.FocalLength == "" {
		flstr := extractXMPString(xmpData, reXmpFocal)
		if flstr != "" {
			num, den := parseFraction(flstr)
			result.FocalLength = formatFocalLength(num, den)
		}
	}
	if result.Aperture == "" {
		fnstr := extractXMPString(xmpData, reXmpFNumber)
		if fnstr != "" {
			num, den := parseFraction(fnstr)
			result.Aperture = formatAperture(num, den)
		}
	}
	if result.ShutterSpeed == "" {
		ssstr := extractXMPString(xmpData, reXmpExposure)
		if ssstr != "" {
			num, den := parseFraction(ssstr)
			result.ShutterSpeed = formatShutterSpeed(num, den)
		}
	}
	if result.ISO == "" {
		isostr := extractXMPString(xmpData, reXmpISO)
		if isostr != "" {
			result.ISO = "ISO" + isostr
		}
	}

	return result
}

func extractXMPString(data []byte, re *regexp.Regexp) string {
	matches := re.FindSubmatch(data)
	if len(matches) > 1 {
		return string(matches[1])
	}
	return ""
}

// floatPrecisionMultiplier represents the precision factor used when converting
// floating point XMP values (e.g. 35.0) into a fractional num/den representation.
const floatPrecisionMultiplier = 10000

func parseFraction(s string) (int64, int64) {
	parts := strings.Split(s, "/")
	if len(parts) == 2 {
		num, err1 := strconv.ParseInt(parts[0], 10, 64)
		den, err2 := strconv.ParseInt(parts[1], 10, 64)
		if err1 == nil && err2 == nil {
			return num, den
		}
	}
	f, err := strconv.ParseFloat(s, 64)
	if err == nil {
		return int64(math.Round(f * floatPrecisionMultiplier)), floatPrecisionMultiplier
	}
	return 0, 0
}

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

	savePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save ExifFrame Image",
		DefaultFilename: defaultFilename,
		Filters: []runtime.FileFilter{
			{DisplayName: filterName, Pattern: filterPattern},
		},
	})

	if err != nil {
		return SaveResult{Error: "Failed to open save dialog: " + err.Error()}
	}

	// User cancelled the dialog
	if savePath == "" {
		return SaveResult{Cancelled: true}
	}

	ext := strings.ToLower(filepath.Ext(savePath))
	if ext == "" {
		// User omitted extension, append the correct one
		if isPng {
			savePath += ".png"
		} else {
			savePath += ".jpg"
		}
	} else {
		// User provided an extension, make sure it matches the output format
		if isPng && ext != ".png" {
			return SaveResult{Error: "Invalid extension. Please save as .png"}
		} else if !isPng && ext != ".jpg" && ext != ".jpeg" {
			return SaveResult{Error: "Invalid extension. Please save as .jpg or .jpeg"}
		}
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

// SelectWatchFolder opens a directory dialog to pick a watch folder
func (a *App) SelectWatchFolder() string {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Watch Folder",
	})
	if err != nil {
		log.Println("Error opening directory dialog:", err)
	}
	return path
}

// SelectExportFolder opens a directory dialog to pick an export folder
func (a *App) SelectExportFolder() string {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Export Folder",
	})
	if err != nil {
		log.Println("Error opening directory dialog:", err)
	}
	return path
}

func formatFocalLength(num, den int64) string {
	if den == 0 {
		return ""
	}
	val := float64(num) / float64(den)
	return strconv.FormatFloat(val, 'f', -1, 64) + "mm"
}

func formatAperture(num, den int64) string {
	if den == 0 {
		return ""
	}
	val := float64(num) / float64(den)
	return fmt.Sprintf("f/%.1f", val)
}

func gcd(a, b int64) int64 {
	if a < 0 {
		a = -a
	}
	if b < 0 {
		b = -b
	}
	for b != 0 {
		a, b = b, a%b
	}
	if a == 0 {
		return 1
	}
	return a
}

func formatShutterSpeed(num, den int64) string {
	if num == 0 || den == 0 {
		return ""
	}
	divisor := gcd(num, den)
	reducedNum := num / divisor
	reducedDen := den / divisor

	switch {
	case reducedDen == 1:
		return fmt.Sprintf("%ds", reducedNum)
	case reducedNum == 1:
		return fmt.Sprintf("1/%ds", reducedDen)
	default:
		return fmt.Sprintf("%d/%ds", reducedNum, reducedDen)
	}
}
