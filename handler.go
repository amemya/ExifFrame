package main

import (
	"io"
	"net/http"
	"os"
	"sync"
)

// ImageHandler provides HTTP endpoints to stream images and receive binary save data,
// avoiding the memory-intensive Base64 IPC transfer.
// It is registered as AssetServer Middleware (not Handler) so that it intercepts
// /api/* requests BEFORE they reach the Vite dev server in development mode.
type ImageHandler struct {
	app *App

	// saveMu protects the pending save state.
	saveMu   sync.Mutex
	savePath string
	saveMime string
	saveReady chan struct{} // signalled when savePath is set
}

// NewImageHandler creates a new ImageHandler.
func NewImageHandler(app *App) *ImageHandler {
	return &ImageHandler{app: app}
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

	h.app.mu.RLock()
	filePath := h.app.currentImagePath
	h.app.mu.RUnlock()

	if filePath == "" {
		http.Error(w, "No image loaded", http.StatusNotFound)
		return
	}

	// http.ServeFile handles Content-Type detection, Range requests, and streaming
	// without loading the entire file into memory.
	http.ServeFile(w, r, filePath)
}

// prepareSave is called from the IPC side (App.SaveImage) after the native save
// dialog completes. It stores the target path and signals the HTTP handler.
func (h *ImageHandler) prepareSave(savePath string, mimeType string) {
	h.saveMu.Lock()
	defer h.saveMu.Unlock()

	h.savePath = savePath
	h.saveMime = mimeType

	// Create a new channel if nil, then close it to signal readiness
	if h.saveReady != nil {
		select {
		case <-h.saveReady:
			// already closed, create a new one
		default:
			close(h.saveReady)
			return
		}
	}
	h.saveReady = make(chan struct{})
	close(h.saveReady)
}

// handleSave receives binary image data via POST and writes it to the path
// previously set by prepareSave().
func (h *ImageHandler) handleSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	h.saveMu.Lock()
	savePath := h.savePath
	expectedMime := h.saveMime
	// Clear the save state after reading
	h.savePath = ""
	h.saveMime = ""
	h.saveMu.Unlock()

	if savePath == "" {
		http.Error(w, "No save path prepared. Call SaveImage first.", http.StatusBadRequest)
		return
	}

	// Cap incoming body to prevent memory exhaustion (100MB)
	const maxBodySize = 100 * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)

	// Validate Content-Type matches what was expected from the save dialog
	contentType := r.Header.Get("Content-Type")
	if expectedMime != "" && contentType != expectedMime {
		http.Error(w, "Content-Type mismatch", http.StatusBadRequest)
		return
	}

	// Stream body directly to file without buffering entirely in memory.
	f, err := os.Create(savePath)
	if err != nil {
		http.Error(w, "Failed to create file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if _, err := io.Copy(f, r.Body); err != nil {
		// Clean up partial file on error
		f.Close()
		os.Remove(savePath)
		http.Error(w, "Failed to write file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	f.Close()

	// Security: Verify the actual file content matches the expected MIME type.
	// Read only the first 512 bytes (enough for http.DetectContentType) to avoid
	// loading the entire file back into memory.
	if expectedMime != "" {
		verifyFile, err := os.Open(savePath)
		if err != nil {
			os.Remove(savePath)
			http.Error(w, "Failed to verify saved file: "+err.Error(), http.StatusInternalServerError)
			return
		}
		header := make([]byte, 512)
		n, _ := verifyFile.Read(header)
		verifyFile.Close()

		actualMime := http.DetectContentType(header[:n])
		if actualMime != expectedMime {
			os.Remove(savePath)
			http.Error(w, "Security Error: saved file content does not match expected type", http.StatusBadRequest)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}
