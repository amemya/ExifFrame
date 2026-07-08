package main

import (
	"image"
	"image/color"
	"testing"
)

func TestRotateImage(t *testing.T) {
	// Create a simple 3x2 image
	// Top row: Red, Green, Blue
	// Bottom row: Cyan, Magenta, Yellow
	img := image.NewRGBA(image.Rect(0, 0, 3, 2))
	img.Set(0, 0, color.RGBA{255, 0, 0, 255})
	img.Set(1, 0, color.RGBA{0, 255, 0, 255})
	img.Set(2, 0, color.RGBA{0, 0, 255, 255})
	img.Set(0, 1, color.RGBA{0, 255, 255, 255})
	img.Set(1, 1, color.RGBA{255, 0, 255, 255})
	img.Set(2, 1, color.RGBA{255, 255, 0, 255})

	tests := []struct {
		name        string
		orientation int
		wantW       int
		wantH       int
		wantTopLeft color.Color
	}{
		{
			name:        "orientation 1 (normal)",
			orientation: 1,
			wantW:       3,
			wantH:       2,
			wantTopLeft: color.RGBA{255, 0, 0, 255},
		},
		{
			name:        "orientation 3 (180)",
			orientation: 3,
			wantW:       3,
			wantH:       2,
			// bottom-right becomes top-left -> Yellow
			wantTopLeft: color.RGBA{255, 255, 0, 255},
		},
		{
			name:        "orientation 6 (90 CW)",
			orientation: 6,
			wantW:       2,
			wantH:       3,
			// bottom-left becomes top-left -> Cyan
			wantTopLeft: color.RGBA{0, 255, 255, 255},
		},
		{
			name:        "orientation 8 (90 CCW)",
			orientation: 8,
			wantW:       2,
			wantH:       3,
			// top-right becomes top-left -> Blue
			wantTopLeft: color.RGBA{0, 0, 255, 255},
		},
		{
			name:        "orientation 2 (unhandled fallback)",
			orientation: 2,
			wantW:       3,
			wantH:       2,
			// unchanged -> Red
			wantTopLeft: color.RGBA{255, 0, 0, 255},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rotated := rotateImage(img, tt.orientation)
			bounds := rotated.Bounds()
			if bounds.Dx() != tt.wantW || bounds.Dy() != tt.wantH {
				t.Errorf("rotateImage() bounds = %dx%d, want %dx%d", bounds.Dx(), bounds.Dy(), tt.wantW, tt.wantH)
			}

			r, g, b, a := rotated.At(0, 0).RGBA()
			wr, wg, wb, wa := tt.wantTopLeft.RGBA()
			if r != wr || g != wg || b != wb || a != wa {
				t.Errorf("rotateImage() top-left color = %v, want %v", rotated.At(0, 0), tt.wantTopLeft)
			}
		})
	}
}
