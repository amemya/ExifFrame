package main

import (
	"regexp"
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
