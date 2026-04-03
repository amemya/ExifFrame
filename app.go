package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

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
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type ExifResult struct {
	ImageBase64  string `json:"imageBase64"`
	Camera       string `json:"camera"`
	Lens         string `json:"lens"`
	FocalLength  string `json:"focalLength"`
	Aperture     string `json:"aperture"`
	ShutterSpeed string `json:"shutterSpeed"`
	ISO          string `json:"iso"`
	Error        string `json:"error"`
	Cancelled    bool   `json:"cancelled"`
}

// OpenImage opens a native file dialog, reads the image, and returns Base64 + EXIF
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
	if !strings.HasPrefix(mimeType, "image/") {
		return ExifResult{Error: "Invalid file: selected file is not a valid image format."}
	}

	result := ExifResult{
		ImageBase64: fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(fileBytes)),
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
	xmpData := fileBytes
	if start := bytes.Index(fileBytes, []byte("<x:xmpmeta")); start != -1 {
		if end := bytes.Index(fileBytes[start:], []byte("</x:xmpmeta>")); end != -1 {
			xmpData = fileBytes[start : start+end+12]
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
		return int64(f * floatPrecisionMultiplier), floatPrecisionMultiplier
	}
	return 0, 0
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
