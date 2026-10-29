package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// formatFocalLength
// ---------------------------------------------------------------------------

func TestFormatFocalLength(t *testing.T) {
	tests := []struct {
		name     string
		num, den int64
		want     string
	}{
		{"zero denominator", 50, 0, ""},
		{"integer value", 50, 1, "50mm"},
		{"fractional value", 350, 10, "35mm"},
		{"large rational", 2400, 100, "24mm"},
		{"decimal result", 185, 10, "18.5mm"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatFocalLength(tt.num, tt.den)
			if got != tt.want {
				t.Errorf("formatFocalLength(%d, %d) = %q, want %q", tt.num, tt.den, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// formatAperture
// ---------------------------------------------------------------------------

func TestFormatAperture(t *testing.T) {
	tests := []struct {
		name     string
		num, den int64
		want     string
	}{
		{"zero denominator", 28, 0, ""},
		{"f/2.8", 28, 10, "f/2.8"},
		{"f/1.4", 14, 10, "f/1.4"},
		{"f/8.0", 8, 1, "f/8.0"},
		{"f/5.6", 56, 10, "f/5.6"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatAperture(tt.num, tt.den)
			if got != tt.want {
				t.Errorf("formatAperture(%d, %d) = %q, want %q", tt.num, tt.den, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// formatShutterSpeed
// ---------------------------------------------------------------------------

func TestFormatShutterSpeed(t *testing.T) {
	tests := []struct {
		name     string
		num, den int64
		want     string
	}{
		{"zero numerator", 0, 250, ""},
		{"zero denominator", 1, 0, ""},
		{"both zero", 0, 0, ""},
		{"integer seconds", 30, 1, "30s"},
		{"1/250s", 1, 250, "1/250s"},
		{"1/8000s", 1, 8000, "1/8000s"},
		{"reducible fraction 10/2500", 10, 2500, "1/250s"},
		{"non-unit numerator 2/5", 2, 5, "2/5s"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatShutterSpeed(tt.num, tt.den)
			if got != tt.want {
				t.Errorf("formatShutterSpeed(%d, %d) = %q, want %q", tt.num, tt.den, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// gcd
// ---------------------------------------------------------------------------

func TestGcd(t *testing.T) {
	tests := []struct {
		name string
		a, b int64
		want int64
	}{
		{"basic", 12, 8, 4},
		{"coprime", 7, 13, 1},
		{"same", 5, 5, 5},
		{"one is zero", 0, 7, 7},
		{"both zero returns 1", 0, 0, 1},
		{"negative a", -12, 8, 4},
		{"negative b", 12, -8, 4},
		{"both negative", -12, -8, 4},
		{"large values", 1000000, 250, 250},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := gcd(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("gcd(%d, %d) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// parseFraction
// ---------------------------------------------------------------------------

func TestParseFraction(t *testing.T) {
	tests := []struct {
		name            string
		input           string
		wantNum, wantDen int64
	}{
		{"simple fraction", "1/250", 1, 250},
		{"large fraction", "10/32000", 10, 32000},
		{"float value", "35.0", 350000, 10000},
		{"float fractional", "2.8", 28000, 10000},
		{"integer as float", "50", 500000, 10000},
		{"invalid string", "abc", 0, 0},
		{"empty string", "", 0, 0},
		{"fraction with bad num", "abc/100", 0, 0},
		{"fraction with bad den", "1/abc", 0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotNum, gotDen := parseFraction(tt.input)
			if gotNum != tt.wantNum || gotDen != tt.wantDen {
				t.Errorf("parseFraction(%q) = (%d, %d), want (%d, %d)",
					tt.input, gotNum, gotDen, tt.wantNum, tt.wantDen)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// extractXMPString
// ---------------------------------------------------------------------------

func TestExtractXMPString(t *testing.T) {
	sampleXMP := []byte(`<x:xmpmeta xmlns:x="adobe:ns:meta/">
		<rdf:Description tiff:Model="Canon EOS R5" aux:Lens="RF50mm F1.2 L USM"/>
	</x:xmpmeta>`)

	tests := []struct {
		name string
		data []byte
		re   *regexp.Regexp
		want string
	}{
		{"match model", sampleXMP, reXmpModel, "Canon EOS R5"},
		{"match lens", sampleXMP, reXmpLens, "RF50mm F1.2 L USM"},
		{"no match", sampleXMP, regexp.MustCompile(`nonexistent="([^"]+)"`), ""},
		{"nil data", nil, reXmpModel, ""},
		{"empty data", []byte{}, reXmpModel, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractXMPString(tt.data, tt.re)
			if got != tt.want {
				t.Errorf("extractXMPString() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestExtractXMPStringWithLens(t *testing.T) {
	xmpWithLens := []byte(`<x:xmpmeta>
		<rdf:Description aux:Lens="RF85mm F1.2 L USM" exifEX:LensModel="RF85mm"/>
	</x:xmpmeta>`)

	got := extractXMPString(xmpWithLens, reXmpLens)
	if got != "RF85mm F1.2 L USM" {
		t.Errorf("extractXMPString(aux:Lens) = %q, want %q", got, "RF85mm F1.2 L USM")
	}

	got = extractXMPString(xmpWithLens, reXmpExifLens)
	if got != "RF85mm" {
		t.Errorf("extractXMPString(exifEX:LensModel) = %q, want %q", got, "RF85mm")
	}
}

func TestExtractXMPStringISO(t *testing.T) {
	xmpWithISO := []byte(`<x:xmpmeta>
		<exif:ISOSpeedRatings>
			<rdf:Seq><rdf:li>800</rdf:li></rdf:Seq>
		</exif:ISOSpeedRatings>
	</x:xmpmeta>`)

	got := extractXMPString(xmpWithISO, reXmpISO)
	if got != "800" {
		t.Errorf("extractXMPString(ISO) = %q, want %q", got, "800")
	}
}

// ---------------------------------------------------------------------------
// extractXMP / extractXMPWithLimits
// ---------------------------------------------------------------------------

type countingReader struct {
	r         io.Reader
	bytesRead int64
}

func (cr *countingReader) Read(p []byte) (int, error) {
	n, err := cr.r.Read(p)
	cr.bytesRead += int64(n)
	return n, err
}

func TestExtractXMP_BasicAndBoundaries(t *testing.T) {
	xmpBlock := `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description tiff:Model="X-T5"/></x:xmpmeta>`
	prefix := strings.Repeat("P", 23)
	suffix := strings.Repeat("S", 37)
	stream := []byte(prefix + xmpBlock + suffix)

	// Test across various chunk sizes including 1 byte, tag lengths, and default 64KB
	chunkSizes := []int{1, 2, 3, 5, 9, 10, 11, 12, 13, 16, 23, 24, 32, 64, xmpScanChunkSize}
	for _, cs := range chunkSizes {
		got := extractXMPWithLimits(bytes.NewReader(stream), maxXmpSearchSize, cs, maxXmpBlockSize)
		if string(got) != xmpBlock {
			t.Errorf("chunkSize=%d: extractXMPWithLimits() = %q, want %q", cs, string(got), xmpBlock)
		}
	}

	// Also verify default extractXMP wrapper
	got := extractXMP(bytes.NewReader(stream))
	if string(got) != xmpBlock {
		t.Errorf("extractXMP() = %q, want %q", string(got), xmpBlock)
	}
}

func TestExtractXMP_PartialStartTagBeforeRealTag(t *testing.T) {
	// Contains partial "<x:xmp" before the real "<x:xmpmeta" across chunk boundaries
	xmpBlock := `<x:xmpmeta><rdf:Description tiff:Model="Z8"/></x:xmpmeta>`
	stream := []byte("1234567<x:xmp" + xmpBlock + "trailing")

	for _, cs := range []int{1, 4, 7, 10, 13, 16} {
		got := extractXMPWithLimits(bytes.NewReader(stream), maxXmpSearchSize, cs, maxXmpBlockSize)
		if string(got) != xmpBlock {
			t.Errorf("chunkSize=%d: got %q, want %q", cs, string(got), xmpBlock)
		}
	}
}

func TestExtractXMP_EarlyReturnStopsReading(t *testing.T) {
	xmpBlock := `<x:xmpmeta><rdf:Description tiff:Model="A7IV"/></x:xmpmeta>`
	// Place XMP near the start, followed by 1 MB of trailing data
	trailing := strings.Repeat("X", 1024*1024)
	stream := []byte("HEADER" + xmpBlock + trailing)

	cr := &countingReader{r: bytes.NewReader(stream)}
	got := extractXMP(cr)
	if string(got) != xmpBlock {
		t.Fatalf("extractXMP() = %q, want %q", string(got), xmpBlock)
	}
	if cr.bytesRead > int64(xmpScanChunkSize) {
		t.Errorf("expected early return after first chunk (<= %d bytes), but read %d bytes", xmpScanChunkSize, cr.bytesRead)
	}
}

func TestExtractXMP_EdgeCasesAndLimits(t *testing.T) {
	xmpBlock := `<x:xmpmeta><rdf:Description tiff:Model="GR III"/></x:xmpmeta>`

	tests := []struct {
		name          string
		input         string
		maxSearchSize int64
		chunkSize     int
		maxBlockSize  int
		want          string
	}{
		{
			name:          "empty input",
			input:         "",
			maxSearchSize: 1024,
			chunkSize:     16,
			maxBlockSize:  1024,
			want:          "",
		},
		{
			name:          "no xmp tags",
			input:         strings.Repeat("not xmp data ", 20),
			maxSearchSize: 1024,
			chunkSize:     16,
			maxBlockSize:  1024,
			want:          "",
		},
		{
			name:          "unclosed xmp tag",
			input:         "prefix <x:xmpmeta><rdf:Description/> no end tag",
			maxSearchSize: 1024,
			chunkSize:     16,
			maxBlockSize:  1024,
			want:          "",
		},
		{
			name:          "only end tag",
			input:         "prefix </x:xmpmeta> suffix",
			maxSearchSize: 1024,
			chunkSize:     16,
			maxBlockSize:  1024,
			want:          "",
		},
		{
			name:          "xmp within maxSearchSize",
			input:         "12345" + xmpBlock + "67890",
			maxSearchSize: int64(5 + len(xmpBlock)),
			chunkSize:     8,
			maxBlockSize:  1024,
			want:          xmpBlock,
		},
		{
			name:          "xmp cut off by maxSearchSize",
			input:         "12345" + xmpBlock + "67890",
			maxSearchSize: int64(5 + len(xmpBlock) - 1),
			chunkSize:     8,
			maxBlockSize:  1024,
			want:          "",
		},
		{
			name:          "xmp within maxBlockSize",
			input:         "prefix" + xmpBlock + "suffix",
			maxSearchSize: 1024,
			chunkSize:     16,
			maxBlockSize:  len(xmpBlock),
			want:          xmpBlock,
		},
		{
			name:          "xmp exceeds maxBlockSize across chunks",
			input:         "prefix" + xmpBlock + "suffix",
			maxSearchSize: 1024,
			chunkSize:     16,
			maxBlockSize:  len(xmpBlock) - 1,
			want:          "",
		},
		{
			name:          "xmp exceeds maxBlockSize within single chunk",
			input:         "prefix" + xmpBlock + "suffix",
			maxSearchSize: 1024,
			chunkSize:     512,
			maxBlockSize:  len(xmpBlock) - 1,
			want:          "",
		},
		{
			name:          "invalid zero maxSearchSize",
			input:         xmpBlock,
			maxSearchSize: 0,
			chunkSize:     16,
			maxBlockSize:  1024,
			want:          "",
		},
		{
			name:          "invalid zero chunkSize",
			input:         xmpBlock,
			maxSearchSize: 1024,
			chunkSize:     0,
			maxBlockSize:  1024,
			want:          "",
		},
		{
			name:          "invalid zero maxBlockSize",
			input:         xmpBlock,
			maxSearchSize: 1024,
			chunkSize:     16,
			maxBlockSize:  0,
			want:          "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractXMPWithLimits(strings.NewReader(tt.input), tt.maxSearchSize, tt.chunkSize, tt.maxBlockSize)
			if string(got) != tt.want {
				t.Errorf("got %q, want %q", string(got), tt.want)
			}
		})
	}
}

func TestProcessImageFile_PNGWithXMPFallback(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(0, 0, color.RGBA{R: 255, G: 0, B: 0, A: 255})

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode png: %v", err)
	}

	xmpPayload := `<x:xmpmeta xmlns:x="adobe:ns:meta/">
		<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
			<rdf:Description
				tiff:Model="NIKON Z 9"
				aux:Lens="NIKKOR Z 24-70mm f/2.8 S"
				exif:FocalLength="50/1"
				exif:FNumber="28/10"
				exif:ExposureTime="1/500"
			>
				<exif:ISOSpeedRatings>
					<rdf:Seq><rdf:li>400</rdf:li></rdf:Seq>
				</exif:ISOSpeedRatings>
			</rdf:Description>
		</rdf:RDF>
	</x:xmpmeta>`
	buf.WriteString(xmpPayload)

	tmpFile := filepath.Join(t.TempDir(), "test_xmp.png")
	if err := os.WriteFile(tmpFile, buf.Bytes(), 0o600); err != nil {
		t.Fatalf("failed to write temp png: %v", err)
	}

	app := NewApp()
	res := app.ProcessImageFile(tmpFile)
	if res.Error != "" {
		t.Fatalf("ProcessImageFile returned error: %v", res.Error)
	}
	if res.Camera != "NIKON Z 9" {
		t.Errorf("Camera = %q, want %q", res.Camera, "NIKON Z 9")
	}
	if res.Lens != "NIKKOR Z 24-70mm f/2.8 S" {
		t.Errorf("Lens = %q, want %q", res.Lens, "NIKKOR Z 24-70mm f/2.8 S")
	}
	if res.FocalLength != "50mm" {
		t.Errorf("FocalLength = %q, want %q", res.FocalLength, "50mm")
	}
	if res.Aperture != "f/2.8" {
		t.Errorf("Aperture = %q, want %q", res.Aperture, "f/2.8")
	}
	if res.ShutterSpeed != "1/500s" {
		t.Errorf("ShutterSpeed = %q, want %q", res.ShutterSpeed, "1/500s")
	}
	if res.ISO != "ISO400" {
		t.Errorf("ISO = %q, want %q", res.ISO, "ISO400")
	}
}

