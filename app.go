package main

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/adrg/sysfont"
	"github.com/rwcarlsen/goexif/exif"
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/image/font/sfnt"
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
	Error        string  `json:"error"`
	Cancelled    bool    `json:"cancelled"`
	FilePath     string  `json:"filePath"`
	OriginalBPP  float64 `json:"originalBPP"`
}

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

// ProcessPaths recursively walks provided paths (or single files) and processes valid images.
func (a *App) ProcessPaths(paths []string) []ExifResult {
	var results []ExifResult
	var validPaths []string

	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			results = append(results, ExifResult{Error: "Failed to access path: " + err.Error(), FilePath: p})
			continue
		}

		if info.IsDir() {
			entries, err := os.ReadDir(p)
			if err != nil {
				results = append(results, ExifResult{Error: "Failed to read directory: " + err.Error(), FilePath: p})
				continue
			}
			for _, entry := range entries {
				if !entry.IsDir() {
					path := filepath.Join(p, entry.Name())
					lower := strings.ToLower(path)
					if strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") || strings.HasSuffix(lower, ".png") {
						validPaths = append(validPaths, path)
					}
				}
			}
		} else {
			validPaths = append(validPaths, p)
		}
	}

	// Process files concurrently with bounded parallelism.
	// ProcessImageFile is thread-safe: doOpenImage uses a.mu for currentImagePath
	// and registerImageToken uses imgMu for token management.
	type indexedResult struct {
		idx int
		res ExifResult
	}
	ch := make(chan indexedResult, len(validPaths))
	sem := make(chan struct{}, goruntime.NumCPU())

	for i, path := range validPaths {
		sem <- struct{}{}
		go func(idx int, p string) {
			defer func() { <-sem }()
			ch <- indexedResult{idx, a.ProcessImageFile(p)}
		}(i, path)
	}

	// Collect results preserving original order
	indexed := make([]ExifResult, len(validPaths))
	for range validPaths {
		ir := <-ch
		indexed[ir.idx] = ir.res
	}
	for _, r := range indexed {
		if r.Error != "" {
			log.Printf("Skipped file: %v", r.Error)
			continue
		}
		results = append(results, r)
	}

	if len(results) == 0 {
		return []ExifResult{{Error: "No valid images found in the selected paths."}}
	}

	return results
}

// ProcessImageFile reads a file, validates it, and extracts EXIF
func (a *App) ProcessImageFile(filePath string) ExifResult {
	f, err := os.Open(filePath)
	if err != nil {
		return ExifResult{Error: "Failed to open file: " + err.Error()}
	}
	defer f.Close()

	// Read up to 512 bytes for MIME type detection
	header := make([]byte, 512)
	n, err := f.Read(header)
	if err != nil && err != io.EOF {
		return ExifResult{Error: "Failed to read file header: " + err.Error()}
	}

	mimeType := http.DetectContentType(header[:n])
	if mimeType != "image/jpeg" && mimeType != "image/png" {
		return ExifResult{Error: "Invalid file: selected file must be a JPG or PNG image."}
	}

	return a.doOpenImage(filePath, f, mimeType)
}

func (a *App) doOpenImage(filePath string, f *os.File, mimeType string) ExifResult {
	// Store the file path for the HTTP handler to serve later (legacy fallback).
	a.mu.Lock()
	a.currentImagePath = filePath
	a.mu.Unlock()

	var url string
	if a.handler != nil {
		token := a.handler.registerImageToken(filePath)
		url = fmt.Sprintf("/api/image?token=%s&t=%d", token, time.Now().UnixNano())
	} else {
		// Cache-busting timestamp ensures the browser fetches the new image.
		url = fmt.Sprintf("/api/image?t=%d", time.Now().UnixNano())
	}

	var originalBPP float64
	if stat, err := f.Stat(); err == nil {
		fileSize := stat.Size()
		if _, err := f.Seek(0, io.SeekStart); err == nil {
			if config, _, err := image.DecodeConfig(f); err == nil {
				if config.Width > 0 && config.Height > 0 {
					originalBPP = float64(fileSize) / float64(config.Width*config.Height)
				}
			}
		}
	}

	result := ExifResult{
		ImageURL:    url,
		MimeType:    mimeType,
		FilePath:    filePath,
		OriginalBPP: originalBPP,
	}

	// Parse EXIF
	// Reset file pointer to the beginning for EXIF decoding
	if _, err := f.Seek(0, io.SeekStart); err == nil {
		x, err := exif.Decode(f)
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
	}

	// Adobe PNG/XMP Fallback (Extract metadata directly from raw XMP block)
	// We read a maximum of the first 50MB to search for the XMP block.
	var xmpData []byte
	const xmpStartTag = "<x:xmpmeta"
	const xmpEndTag = "</x:xmpmeta>"
	const maxXmpSearchSize = 50 * 1024 * 1024 // 50 MB

	if _, err := f.Seek(0, io.SeekStart); err == nil {
		if fileInfo, statErr := f.Stat(); statErr == nil {
			readSize := fileInfo.Size()
			if readSize > maxXmpSearchSize {
				readSize = maxXmpSearchSize
			}
			if readSize > 0 {
				searchBuf := make([]byte, readSize)
				n, readErr := io.ReadFull(f, searchBuf)
				if n > 0 && (readErr == nil || readErr == io.EOF || readErr == io.ErrUnexpectedEOF) {
					searchBuf = searchBuf[:n]
					if start := bytes.Index(searchBuf, []byte(xmpStartTag)); start != -1 {
						if end := bytes.Index(searchBuf[start:], []byte(xmpEndTag)); end != -1 {
							xmpData = searchBuf[start : start+end+len(xmpEndTag)]
						}
					}
				}
			}
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

var (
	cachedFonts []string
	fontsOnce   sync.Once
)

// getFontFamilyName parses a font file (TTF/OTF) to extract its family name.
func getFontFamilyName(filename string) string {
	f, err := os.Open(filename)
	if err != nil {
		return ""
	}
	defer f.Close()

	font, err := sfnt.ParseReaderAt(f)
	if err != nil {
		return ""
	}

	name, err := font.Name(nil, sfnt.NameIDFamily)
	if err != nil {
		return ""
	}
	return name
}

// GetSystemFonts returns a list of installed system fonts (Family names).
func (a *App) GetSystemFonts() []string {
	fontsOnce.Do(func() {
		finder := sysfont.NewFinder(nil)
		fonts := finder.List()

		fontMap := make(map[string]bool)
		var uniqueFonts []string

		for _, f := range fonts {
			family := f.Family
			if family == "" && f.Filename != "" {
				family = getFontFamilyName(f.Filename)
			}
			
			if family != "" {
				lowerFamily := strings.ToLower(family)
				if !fontMap[lowerFamily] {
					fontMap[lowerFamily] = true
					uniqueFonts = append(uniqueFonts, family)
				}
			}
		}

		sort.Slice(uniqueFonts, func(i, j int) bool {
			return strings.ToLower(uniqueFonts[i]) < strings.ToLower(uniqueFonts[j])
		})
		
		cachedFonts = uniqueFonts
	})

	result := make([]string, len(cachedFonts))
	copy(result, cachedFonts)
	return result
}
