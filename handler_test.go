package main

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// newTestHandler returns an ImageHandler wired to a dummy App (no Wails deps).
func newTestHandler() *ImageHandler {
	app := &App{}
	h := NewImageHandler(app)
	app.handler = h
	return h
}

// ---------------------------------------------------------------------------
// registerImageToken
// ---------------------------------------------------------------------------

func TestRegisterImageToken_Basic(t *testing.T) {
	h := newTestHandler()
	token := h.registerImageToken("/tmp/photo.jpg")
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// Same path should return the same token.
	token2 := h.registerImageToken("/tmp/photo.jpg")
	if token2 != token {
		t.Errorf("same path should reuse token: got %q, want %q", token2, token)
	}

	// Different path should return a different token.
	token3 := h.registerImageToken("/tmp/other.jpg")
	if token3 == token {
		t.Error("different path should produce a different token")
	}
}

func TestRegisterImageToken_LRUEviction(t *testing.T) {
	h := newTestHandler()

	// Register the first path and record its token.
	firstPath := filepath.Join("/tmp", "first.jpg")
	firstToken := h.registerImageToken(firstPath)

	// Fill up to the max (first entry is already registered, so start at 1).
	for i := 1; i < maxImageTokens; i++ {
		h.registerImageToken(filepath.Join("/tmp", "img"+string(rune('A'+i%26))+string(rune('0'+i/26))+".jpg"))
	}

	if len(h.imageTokens) != maxImageTokens {
		t.Fatalf("expected %d tokens, got %d", maxImageTokens, len(h.imageTokens))
	}

	// Register one more — should evict the oldest (firstPath).
	h.registerImageToken("/tmp/overflow.jpg")
	if len(h.imageTokens) != maxImageTokens {
		t.Fatalf("after overflow expected %d tokens, got %d", maxImageTokens, len(h.imageTokens))
	}

	// The evicted path should now yield a fresh token, not the original.
	newToken := h.registerImageToken(firstPath)
	if newToken == firstToken {
		t.Error("expected oldest entry to be evicted and re-registered with a new token")
	}
}

// ---------------------------------------------------------------------------
// prepareSave / handleSave round-trip
// ---------------------------------------------------------------------------

// encodeTestJPEGBytes returns a small valid JPEG as a byte slice.
func encodeTestJPEGBytes(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{255, 0, 0, 255})
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// createTestJPEG writes a small valid JPEG to the given path.
func createTestJPEG(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, encodeTestJPEGBytes(t), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestHandleSave_Success(t *testing.T) {
	h := newTestHandler()

	dir := t.TempDir()
	savePath := filepath.Join(dir, "output.jpg")

	token := h.prepareSave(savePath, "image/jpeg")

	req := httptest.NewRequest(http.MethodPost, "/api/save?token="+token, bytes.NewReader(encodeTestJPEGBytes(t)))
	req.Header.Set("Content-Type", "image/jpeg")
	w := httptest.NewRecorder()

	h.handleSave(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify the file was written.
	if _, err := os.Stat(savePath); err != nil {
		t.Errorf("saved file should exist: %v", err)
	}
}

func TestHandleSave_MissingToken(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/save", nil)
	w := httptest.NewRecorder()
	h.handleSave(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleSave_InvalidToken(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/save?token=bogus", nil)
	w := httptest.NewRecorder()
	h.handleSave(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleSave_ExpiredToken(t *testing.T) {
	h := newTestHandler()

	dir := t.TempDir()
	token := h.prepareSave(filepath.Join(dir, "out.jpg"), "image/jpeg")

	// Manually expire the session.
	h.saveMu.Lock()
	if s, ok := h.saveSessions[token]; ok {
		s.expiresAt = time.Now().Add(-1 * time.Second)
	}
	h.saveMu.Unlock()

	jpegBody := encodeTestJPEGBytes(t)

	req := httptest.NewRequest(http.MethodPost, "/api/save?token="+token, bytes.NewReader(jpegBody))
	req.Header.Set("Content-Type", "image/jpeg")
	w := httptest.NewRecorder()
	h.handleSave(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for expired token, got %d", w.Code)
	}
}

func TestHandleSave_ContentTypeMismatch(t *testing.T) {
	h := newTestHandler()

	dir := t.TempDir()
	token := h.prepareSave(filepath.Join(dir, "out.jpg"), "image/jpeg")

	// Send PNG content-type but session expects JPEG.
	var body bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	png.Encode(&body, img)

	req := httptest.NewRequest(http.MethodPost, "/api/save?token="+token, &body)
	req.Header.Set("Content-Type", "image/png")
	w := httptest.NewRecorder()
	h.handleSave(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for content-type mismatch, got %d", w.Code)
	}
}

func TestHandleSave_EmptyPayload(t *testing.T) {
	h := newTestHandler()

	dir := t.TempDir()
	token := h.prepareSave(filepath.Join(dir, "out.jpg"), "image/jpeg")

	req := httptest.NewRequest(http.MethodPost, "/api/save?token="+token, bytes.NewReader(nil))
	req.Header.Set("Content-Type", "image/jpeg")
	w := httptest.NewRecorder()
	h.handleSave(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty payload, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleSave_MethodNotAllowed(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/save?token=foo", nil)
	w := httptest.NewRecorder()
	h.handleSave(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// handleImage
// ---------------------------------------------------------------------------

func TestHandleImage_WithToken(t *testing.T) {
	h := newTestHandler()

	// Register a real temporary file.
	dir := t.TempDir()
	imgPath := filepath.Join(dir, "test.jpg")
	createTestJPEG(t, imgPath)

	token := h.registerImageToken(imgPath)

	req := httptest.NewRequest(http.MethodGet, "/api/image?token="+token, nil)
	w := httptest.NewRecorder()
	h.handleImage(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if w.Body.Len() == 0 {
		t.Error("expected non-empty body")
	}
}

func TestHandleImage_NoToken_NoImage(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/image", nil)
	w := httptest.NewRecorder()
	h.handleImage(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestHandleImage_MethodNotAllowed(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/image", nil)
	w := httptest.NewRecorder()
	h.handleImage(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestHandleImage_InvalidToken(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/image?token=nonexistent", nil)
	w := httptest.NewRecorder()
	h.handleImage(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// handleThumb
// ---------------------------------------------------------------------------

func TestHandleThumb_NoToken(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/thumb", nil)
	w := httptest.NewRecorder()
	h.handleThumb(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestHandleThumb_MethodNotAllowed(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/thumb", nil)
	w := httptest.NewRecorder()
	h.handleThumb(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestHandleThumb_WithToken(t *testing.T) {
	h := newTestHandler()

	dir := t.TempDir()
	imgPath := filepath.Join(dir, "test.jpg")
	createTestJPEG(t, imgPath)

	token := h.registerImageToken(imgPath)

	req := httptest.NewRequest(http.MethodGet, "/api/thumb?token="+token, nil)
	w := httptest.NewRecorder()
	h.handleThumb(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	ct := w.Header().Get("Content-Type")
	if ct != "image/jpeg" {
		t.Errorf("expected Content-Type image/jpeg, got %q", ct)
	}
}

// ---------------------------------------------------------------------------
// Middleware routing
// ---------------------------------------------------------------------------

func TestMiddleware_RoutesAPIRequests(t *testing.T) {
	h := newTestHandler()

	// The fallback handler records that it was called.
	fallbackCalled := false
	fallback := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalled = true
		w.WriteHeader(http.StatusTeapot) // easily distinguishable
	})

	mw := h.Middleware(fallback)

	tests := []struct {
		method  string
		path    string
		wantFallback bool
	}{
		{http.MethodGet, "/api/image", false},
		{http.MethodGet, "/api/thumb", false},
		{http.MethodPost, "/api/save", false},
		{http.MethodGet, "/", true},
		{http.MethodGet, "/index.html", true},
		{http.MethodGet, "/other", true},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			fallbackCalled = false
			req := httptest.NewRequest(tt.method, tt.path, nil)
			w := httptest.NewRecorder()
			mw.ServeHTTP(w, req)

			if tt.wantFallback && !fallbackCalled {
				t.Error("expected fallback handler to be called")
			}
			if !tt.wantFallback && fallbackCalled {
				t.Error("expected API handler to be called, not fallback")
			}
		})
	}
}

// ---------------------------------------------------------------------------
// generateToken
// ---------------------------------------------------------------------------

func TestGenerateToken_Uniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		tok := generateToken()
		if tok == "" {
			t.Fatal("empty token")
		}
		if seen[tok] {
			t.Fatalf("duplicate token on iteration %d", i)
		}
		seen[tok] = true
	}
}

// ---------------------------------------------------------------------------
// Token consumed only once (handleSave)
// ---------------------------------------------------------------------------

func TestHandleSave_TokenConsumedOnce(t *testing.T) {
	h := newTestHandler()

	dir := t.TempDir()
	savePath := filepath.Join(dir, "output.jpg")
	token := h.prepareSave(savePath, "image/jpeg")

	makeBody := func() io.Reader {
		return bytes.NewReader(encodeTestJPEGBytes(t))
	}

	// First request succeeds.
	req := httptest.NewRequest(http.MethodPost, "/api/save?token="+token, makeBody())
	req.Header.Set("Content-Type", "image/jpeg")
	w := httptest.NewRecorder()
	h.handleSave(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("first save: expected 200, got %d", w.Code)
	}

	// Second request with same token should fail.
	req2 := httptest.NewRequest(http.MethodPost, "/api/save?token="+token, makeBody())
	req2.Header.Set("Content-Type", "image/jpeg")
	w2 := httptest.NewRecorder()
	h.handleSave(w2, req2)
	if w2.Code != http.StatusBadRequest {
		t.Errorf("second save: expected 400, got %d", w2.Code)
	}
}
