package main

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

// ImageHandler provides HTTP endpoints to stream images and receive binary save data,
// avoiding the memory-intensive Base64 IPC transfer.
// It is registered as AssetServer Middleware (not Handler) so that it intercepts
// /api/* requests BEFORE they reach the Vite dev server in development mode.
type ImageHandler struct {
	app *App

	// saveMu protects the pending save sessions.
	saveMu       sync.Mutex
	saveSessions map[string]*saveSession
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
		app:          app,
		saveSessions: make(map[string]*saveSession),
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

	filePath := h.app.getCurrentImagePath()

	if filePath == "" {
		http.Error(w, "No image loaded", http.StatusNotFound)
		return
	}

	// http.ServeFile handles Content-Type detection, Range requests, and streaming
	// without loading the entire file into memory.
	http.ServeFile(w, r, filePath)
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
	if err := f.Close(); err != nil {
		os.Remove(savePath)
		http.Error(w, "Failed to write file: "+err.Error(), http.StatusInternalServerError)
		return
	}

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

// generateToken returns a cryptographically random 16-byte hex string.
func generateToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback: use timestamp (less secure but functional)
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return hex.EncodeToString(b)
}
