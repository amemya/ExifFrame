package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/rwcarlsen/goexif/exif"
	"github.com/wailsapp/wails/v2/pkg/runtime"
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
		return ExifResult{Error: "CANCELLED"} // user cancelled
	}

	bytes, err := os.ReadFile(filePath)
	if err != nil {
		return ExifResult{Error: "Failed to read file: " + err.Error()}
	}

	result := ExifResult{
		ImageBase64: "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(bytes),
	}

	// Parse EXIF
	f, err := os.Open(filePath)
	if err == nil {
		defer f.Close()
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
				if den != 0 {
					result.FocalLength = fmt.Sprintf("%dmm", num/den)
				}
			}
			if fno, err := x.Get(exif.FNumber); err == nil {
				num, den, _ := fno.Rat2(0)
				if den != 0 {
					result.Aperture = fmt.Sprintf("f/%.1f", float64(num)/float64(den))
				}
			}
			if ss, err := x.Get(exif.ExposureTime); err == nil {
				num, den, _ := ss.Rat2(0)
				if num != 0 && den != 0 {
					val := float64(den) / float64(num)
					if val >= 1.0 {
						result.ShutterSpeed = fmt.Sprintf("1/%ds", int(val))
					} else {
						result.ShutterSpeed = fmt.Sprintf("%gs", float64(num)/float64(den))
					}
				}
			}
			if iso, err := x.Get(exif.ISOSpeedRatings); err == nil {
				result.ISO = "ISO" + iso.String()
			}
		}
	}

	// Adobe PNG/XMP Fallback (Extract metadata directly from raw XMP block)
	if result.Camera == "" {
		result.Camera = extractXMPString(bytes, `tiff:Model="([^"]+)"`)
		if result.Camera == "" {
			// Fallback to cc:Model
			result.Camera = extractXMPString(bytes, `crs:CameraProfile="([^"]+)"`)
		}
	}
	if result.Lens == "" {
		result.Lens = extractXMPString(bytes, `aux:Lens="([^"]+)"`)
		if result.Lens == "" {
			result.Lens = extractXMPString(bytes, `exifEX:LensModel="([^"]+)"`)
		}
	}
	if result.FocalLength == "" {
		flstr := extractXMPString(bytes, `exif:FocalLength="([^"]+)"`)
		if flstr != "" {
			num, den := parseFraction(flstr)
			if den != 0 {
				result.FocalLength = fmt.Sprintf("%dmm", num/den)
			}
		}
	}
	if result.Aperture == "" {
		fnstr := extractXMPString(bytes, `exif:FNumber="([^"]+)"`)
		if fnstr != "" {
			num, den := parseFraction(fnstr)
			if den != 0 {
				result.Aperture = fmt.Sprintf("f/%.1f", float64(num)/float64(den))
			}
		}
	}
	if result.ShutterSpeed == "" {
		ssstr := extractXMPString(bytes, `exif:ExposureTime="([^"]+)"`)
		if ssstr != "" {
			// usually already resembles "1/160" but we can ensure formatting
			num, den := parseFraction(ssstr)
			if num != 0 && den != 0 {
				val := float64(den) / float64(num)
				if val >= 1.0 {
					result.ShutterSpeed = fmt.Sprintf("1/%ds", int(val))
				} else {
					result.ShutterSpeed = fmt.Sprintf("%gs", float64(num)/float64(den))
				}
			} else if num != 0 {
				result.ShutterSpeed = fmt.Sprintf("%ds", num)
			}
		}
	}
	if result.ISO == "" {
		// XMP ISO is often in an rdf:Seq list
		isostr := extractXMPString(bytes, `(?s)<exif:ISOSpeedRatings>.*?<rdf:li>(\d+)</rdf:li>`)
		if isostr != "" {
			result.ISO = "ISO" + isostr
		}
	}

	return result
}

func extractXMPString(data []byte, pattern string) string {
	re := regexp.MustCompile(pattern)
	matches := re.FindSubmatch(data)
	if len(matches) > 1 {
		return string(matches[1])
	}
	return ""
}

func parseFraction(s string) (int64, int64) {
	parts := strings.Split(s, "/")
	if len(parts) == 2 {
		num, _ := strconv.ParseInt(parts[0], 10, 64)
		den, _ := strconv.ParseInt(parts[1], 10, 64)
		return num, den
	}
	num, _ := strconv.ParseInt(s, 10, 64)
	return num, 1
}
