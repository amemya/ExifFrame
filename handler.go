package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"image"
	"image/jpeg"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/rwcarlsen/goexif/exif"
	"golang.org/x/image/draw"
)

const maxImageTokens = 2000

// fileOpenSem restricts the number of concurrent file opens for /api/image and /api/thumb
// to avoid hitting the OS file descriptor limit (e.g. 256 on macOS).
var fileOpenSem = make(chan struct{}, 100)

// thumbProcessSem restricts concurrent heavy image decoding/resizing.
var thumbProcessSem = make(chan struct{}, 4)

// ImageHandler provides HTTP endpoints to stream images and receive binary save data,
// avoiding the memory-intensive Base64 IPC transfer.
// It is registered as AssetServer Middleware (not Handler) so that it intercepts
// /api/* requests BEFORE they reach the Vite dev server in development mode.
type ImageHandler struct {
	app *App

	// saveMu protects the pending save sessions.
	saveMu       sync.Mutex
	saveSessions map[string]*saveSession

	// imgMu protects the image tokens for serving specific files.
	imgMu           sync.RWMutex
	imageTokens     map[string]string // token -> filePath
	pathToToken     map[string]string // filePath -> token
	imageTokenOrder []string
}

// saveSession holds metadata for a single pending save operation.
// Each session is bound to a unique token and expires after a short TTL.
type saveSession struct {
	path      string
	mime      string
	expiresAt time.Time
}

// saveTTL is the maximum time a save session remains valid.
// If the frontend doesn't POST within this window, the session is discarded.
const saveTTL = 60 * time.Second

// NewImageHandler creates a new ImageHandler.
func NewImageHandler(app *App) *ImageHandler {
	return &ImageHandler{
		app:             app,
		saveSessions:    make(map[string]*saveSession),
		imageTokens:     make(map[string]string),
		pathToToken:     make(map[string]string),
		imageTokenOrder: make([]string, 0, 100),
	}
}

// Middleware returns an assetserver.Middleware that intercepts /api/* requests.
// In dev mode, Wails proxies all requests to the Vite dev server first, and
// Vite's SPA fallback returns index.html (200) for unknown paths — meaning a
// plain Handler would never be reached. Middleware runs BEFORE the asset pipeline,
// so it reliably captures /api/* in both dev and production modes.
func (h *ImageHandler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/image":
			h.handleImage(w, r)
		case "/api/thumb":
			h.handleThumb(w, r)
		case "/api/save":
			h.handleSave(w, r)
		default:
			next.ServeHTTP(w, r)
		}
	})
}

// handleImage streams the currently opened image file directly from disk.
// This avoids loading the entire file into Go memory and Base64-encoding it.
func (h *ImageHandler) handleImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var filePath string
	token := r.URL.Query().Get("token")

	if token != "" {
		h.imgMu.RLock()
		filePath = h.imageTokens[token]
		h.imgMu.RUnlock()
	} else {
		// Fallback for legacy behavior
		filePath = h.app.getCurrentImagePath()
	}

	if filePath == "" {
		http.Error(w, "No image loaded or token not found", http.StatusNotFound)
		return
	}

	fileOpenSem <- struct{}{}
	defer func() { <-fileOpenSem }()

	// http.ServeFile handles Content-Type detection, Range requests, and streaming
	// without loading the entire file into memory.
	http.ServeFile(w, r, filePath)
}

// rotateImage applies rotation based on EXIF orientation (1-8).
// Implements the most common camera rotations: 3 (180), 6 (90 CW), 8 (90 CCW).
func rotateImage(img image.Image, orientation int) image.Image {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	var dst *image.RGBA
	switch orientation {
	case 3: // 180 degrees
		dst = image.NewRGBA(image.Rect(0, 0, w, h))
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				dst.Set(w-1-x, h-1-y, img.At(bounds.Min.X+x, bounds.Min.Y+y))
			}
		}
	case 6: // 90 degrees CW
		dst = image.NewRGBA(image.Rect(0, 0, h, w))
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				dst.Set(h-1-y, x, img.At(bounds.Min.X+x, bounds.Min.Y+y))
			}
		}
	case 8: // 90 degrees CCW
		dst = image.NewRGBA(image.Rect(0, 0, h, w))
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				dst.Set(y, w-1-x, img.At(bounds.Min.X+x, bounds.Min.Y+y))
			}
		}
	default:
		return img
	}
	return dst
}

// handleThumb serves a lightweight thumbnail for the requested image token.
func (h *ImageHandler) handleThumb(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.URL.Query().Get("token")
	h.imgMu.RLock()
	filePath := h.imageTokens[token]
	h.imgMu.RUnlock()

	if filePath == "" {
		http.Error(w, "Token not found", http.StatusNotFound)
		return
	}

	// 1. Try to get EXIF thumbnail and Orientation first
	orientation, pic, serveExif := func() (int, []byte, bool) {
		fileOpenSem <- struct{}{}
		defer func() { <-fileOpenSem }()

		f, err := os.Open(filePath)
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return 1, nil, true // Return true so we don't proceed to generation
		}
		defer f.Close()

		orientation := 1
		x, err := exif.Decode(f)
		if err == nil {
			if tag, err := x.Get(exif.Orientation); err == nil {
				if v, err := tag.Int(0); err == nil {
					orientation = v
				}
			}

			pic, err := x.JpegThumbnail()
			if err == nil && len(pic) > 0 {
				if orientation != 3 && orientation != 6 && orientation != 8 {
					w.Header().Set("Content-Type", "image/jpeg")
					w.Write(pic)
					return orientation, nil, true
				} else {
					// We have an EXIF thumb that needs rotation.
					return orientation, pic, true
				}
			}
		}
		return orientation, nil, false
	}()

	if serveExif {
		if len(pic) > 0 {
			// EXIF rotation path. Safe to process without thumbProcessSem as it's a very small image.
			if thumbImg, _, err := image.Decode(bytes.NewReader(pic)); err == nil {
				rotatedThumb := rotateImage(thumbImg, orientation)
				var buf bytes.Buffer
				if err := jpeg.Encode(&buf, rotatedThumb, &jpeg.Options{Quality: 85}); err == nil {
					w.Header().Set("Content-Type", "image/jpeg")
					w.Write(buf.Bytes())
					return
				}
			}

			// Fallback to unrotated if rotation/encoding fails
			w.Header().Set("Content-Type", "image/jpeg")
			w.Write(pic)
		}
		return
	}

	// 2. No EXIF thumbnail, generate one on the fly safely
	// Acquire thumbProcessSem BEFORE fileOpenSem to prevent starvation of /api/image requests
	thumbProcessSem <- struct{}{}
	defer func() { <-thumbProcessSem }()

	func() {
		fileOpenSem <- struct{}{}
		defer func() { <-fileOpenSem }()

		f, err := os.Open(filePath)
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		defer f.Close()

		// Decode high-res image
		img, _, err := image.Decode(f)
		if err != nil {
			http.Error(w, "Failed to decode image", http.StatusInternalServerError)
			return
		}

		// Calculate thumbnail size (max 256x256)
		bounds := img.Bounds()
		w0, h0 := bounds.Dx(), bounds.Dy()
		if w0 <= 0 || h0 <= 0 {
			http.Error(w, "Invalid image dimensions", http.StatusInternalServerError)
			return
		}

		var w1, h1 int
		if w0 > h0 {
			w1 = 256
			h1 = h0 * 256 / w0
		} else {
			h1 = 256
			w1 = w0 * 256 / h0
		}
		if w1 == 0 {
			w1 = 1
		}
		if h1 == 0 {
			h1 = 1
		}

		dst := image.NewRGBA(image.Rect(0, 0, w1, h1))
		// ApproxBiLinear is faster than CatmullRom and sufficient for a thumbnail
		draw.ApproxBiLinear.Scale(dst, dst.Bounds(), img, bounds, draw.Src, nil)

		var finalImg image.Image = dst
		if orientation == 3 || orientation == 6 || orientation == 8 {
			finalImg = rotateImage(dst, orientation)
		}

		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, finalImg, &jpeg.Options{Quality: 70}); err != nil {
			log.Printf("Failed to encode generated thumbnail: %v", err)
			http.Error(w, "Failed to encode thumbnail", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(buf.Bytes())
	}()
}

// prepareSave is called from the IPC side (App.SaveImage) after the native save
// dialog completes. It generates a unique token, stores the save metadata, and
// returns the token. The frontend must include this token in the POST to /api/save.
// This 1:1 binding prevents race conditions from concurrent saves and ensures
// stale state cannot be consumed by an unrelated request.
func (h *ImageHandler) prepareSave(savePath string, mimeType string) string {
	token := generateToken()

	h.saveMu.Lock()
	defer h.saveMu.Unlock()

	// Garbage-collect any expired sessions.
	now := time.Now()
	for k, s := range h.saveSessions {
		if now.After(s.expiresAt) {
			delete(h.saveSessions, k)
		}
	}

	h.saveSessions[token] = &saveSession{
		path:      savePath,
		mime:      mimeType,
		expiresAt: now.Add(saveTTL),
	}

	return token
}

// registerImageToken creates a token mapped to a specific file path
// and returns the token so it can be used in /api/image requests.
func (h *ImageHandler) registerImageToken(filePath string) string {
	h.imgMu.Lock()
	defer h.imgMu.Unlock()

	// Reuse existing token if filePath is already registered
	if t, exists := h.pathToToken[filePath]; exists {
		// Move to end for LRU behavior
		for i, ot := range h.imageTokenOrder {
			if ot == t {
				h.imageTokenOrder = append(h.imageTokenOrder[:i], h.imageTokenOrder[i+1:]...)
				h.imageTokenOrder = append(h.imageTokenOrder, t)
				break
			}
		}
		return t
	}

	token := generateToken()

	// Limit size to prevent memory leaks if many images are opened
	if len(h.imageTokens) >= maxImageTokens {
		// Evict the oldest entry (FIFO with registration-time refresh) to free space.
		if len(h.imageTokenOrder) > 0 {
			oldestToken := h.imageTokenOrder[0]
			// Shift elements to avoid allocating new backing arrays and prevent memory leaks
			copy(h.imageTokenOrder, h.imageTokenOrder[1:])
			h.imageTokenOrder[len(h.imageTokenOrder)-1] = "" // clear old reference
			h.imageTokenOrder = h.imageTokenOrder[:len(h.imageTokenOrder)-1]

			if oldPath, ok := h.imageTokens[oldestToken]; ok {
				delete(h.pathToToken, oldPath)
			}
			delete(h.imageTokens, oldestToken)
		} else {
			// Fallback (should not happen if imageTokenOrder is consistent)
			for k, p := range h.imageTokens {
				delete(h.pathToToken, p)
				delete(h.imageTokens, k)
				break
			}
		}
	}

	h.imageTokens[token] = filePath
	h.pathToToken[filePath] = token
	h.imageTokenOrder = append(h.imageTokenOrder, token)
	return token
}

// handleSave receives binary image data via POST and writes it to the path
// associated with the provided save token.
func (h *ImageHandler) handleSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Missing save token", http.StatusBadRequest)
		return
	}

	// Atomically look up and consume the session.
	h.saveMu.Lock()
	session, ok := h.saveSessions[token]
	if ok {
		delete(h.saveSessions, token)
	}
	h.saveMu.Unlock()

	if !ok {
		http.Error(w, "Invalid or expired save token", http.StatusBadRequest)
		return
	}
	if time.Now().After(session.expiresAt) {
		http.Error(w, "Save token expired", http.StatusBadRequest)
		return
	}

	savePath := session.path
	expectedMime := session.mime

	// Validate Content-Type matches what was expected from the save dialog.
	// Use mime.ParseMediaType to ignore parameters like charset.
	contentType := r.Header.Get("Content-Type")
	if expectedMime != "" && contentType != "" {
		mediaType, _, err := mime.ParseMediaType(contentType)
		if err != nil || mediaType != expectedMime {
			http.Error(w, "Content-Type mismatch", http.StatusBadRequest)
			return
		}
	} else if expectedMime != "" && contentType == "" {
		http.Error(w, "Missing Content-Type", http.StatusBadRequest)
		return
	}

	// Write to a temporary file in the system temp directory (os.TempDir).
	// This avoids macOS Sandbox permission issues which restrict writing to
	// the target's parent directory, and ensures existing files are not truncated
	// until the entire upload is successful.
	tmpFile, err := os.CreateTemp("", "exifframe-save-*.tmp")
	if err != nil {
		http.Error(w, "Failed to create temp file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath) // Automatically clean up temp file if not renamed

	// Stream body directly to the system temp file.
	written, err := io.Copy(tmpFile, r.Body)
	if err != nil {
		tmpFile.Close()
		http.Error(w, "Failed to stream upload: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tmpFile.Close(); err != nil {
		http.Error(w, "Failed to close and flush temp file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if written == 0 {
		http.Error(w, "Empty image payload received", http.StatusBadRequest)
		return
	}

	// Security: Verify the actual file content matches the expected MIME type.
	if expectedMime != "" {
		verifyFile, err := os.Open(tmpPath)
		if err != nil {
			http.Error(w, "Failed to verify saved file: "+err.Error(), http.StatusInternalServerError)
			return
		}
		header := make([]byte, 512)
		n, _ := verifyFile.Read(header)
		verifyFile.Close()

		if n == 0 {
			http.Error(w, "Security Error: Unable to read saved file", http.StatusInternalServerError)
			return
		}

		actualMime := http.DetectContentType(header[:n])
		if actualMime != expectedMime {
			http.Error(w, "Security Error: saved file content does not match expected type", http.StatusBadRequest)
			return
		}
	}

	// Everything succeeded and is validated. Move the temp file to the final destination.
	// We attempt an atomic os.Rename first. If it fails (e.g., EXDEV cross-device link),
	// we fallback to io.Copy.
	if err := os.Rename(tmpPath, savePath); err != nil {
		// Fallback: Copy the file manually since os.Rename across volumes is not allowed
		in, err := os.Open(tmpPath)
		if err != nil {
			http.Error(w, "Failed to open temp file for copying: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer in.Close()

		out, err := os.Create(savePath)
		if err != nil {
			http.Error(w, "Failed to create final file: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer out.Close()

		if _, err := io.Copy(out, in); err != nil {
			out.Close()
			os.Remove(savePath)
			http.Error(w, "Failed to copy to final destination: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Ensure it's fully written
		if err := out.Sync(); err != nil {
			out.Close()
			os.Remove(savePath)
			http.Error(w, "Failed to sync final destination: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	// Send the HTTP response immediately before showing the notification.
	w.WriteHeader(http.StatusOK)

	// Show a native notification on macOS (asynchronously to avoid blocking the response)
	if runtime.GOOS == "darwin" {
		go func() {
			fileName := filepath.Base(savePath)
			// Prevent AppleScript injection
			fileName = strings.ReplaceAll(fileName, `\`, `\\`)
			fileName = strings.ReplaceAll(fileName, `"`, `\"`)
			msg := "Saved " + fileName
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := exec.CommandContext(ctx, "osascript", "-e", `display notification "`+msg+`" with title "ExifFrame"`).Run(); err != nil {
				log.Println("Notification failed:", err)
			}
		}()
	}
}

// generateToken returns a cryptographically random 16-byte hex string.
func generateToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback: use timestamp (less secure but functional)
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return hex.EncodeToString(b)
}
