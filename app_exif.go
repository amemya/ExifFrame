package main

import (
	"bytes"
	"fmt"
	"image"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"strconv"
	"strings"
	"time"
	"github.com/rwcarlsen/goexif/exif"
	_ "image/jpeg"
	_ "image/png"
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

type ExifResult struct {
	ImageURL     string  `json:"imageURL"`
	ThumbURL     string  `json:"thumbURL"`
	MimeType     string  `json:"mimeType"`
	Camera       string  `json:"camera"`
	Lens         string  `json:"lens"`
	FocalLength  string `json:"focalLength"`
	Aperture     string `json:"aperture"`
	ShutterSpeed string `json:"shutterSpeed"`
	ISO          string `json:"iso"`
	Error        string  `json:"error"`
	Cancelled    bool    `json:"cancelled"`
	FilePath     string  `json:"filePath"`
	OriginalBPP  float64 `json:"originalBPP"`
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

	if len(validPaths) > maxImageTokens {
		results = append(results, ExifResult{Error: fmt.Sprintf("%d枚を超える画像が選択されました。最初の%d枚のみ読み込みます。", maxImageTokens, maxImageTokens)})
		validPaths = validPaths[:maxImageTokens]
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
	var thumbUrl string
	if a.handler != nil {
		token := a.handler.registerImageToken(filePath)
		url = fmt.Sprintf("/api/image?token=%s&t=%d", token, time.Now().UnixNano())
		thumbUrl = fmt.Sprintf("/api/thumb?token=%s&t=%d", token, time.Now().UnixNano())
	} else {
		// Cache-busting timestamp ensures the browser fetches the new image.
		url = fmt.Sprintf("/api/image?t=%d", time.Now().UnixNano())
		thumbUrl = url // Fallback
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
		ThumbURL:    thumbUrl,
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

