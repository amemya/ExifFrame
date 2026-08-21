package main

import (
	"sort"
	"testing"
)

func TestGetFontFamilyNames(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		want     []string
	}{
		{
			name:     "TTC file with multiple fonts",
			filename: "testdata/dummy.ttc",
			want:     []string{"Avenir", "Avenir", "Avenir Black", "Avenir Black Oblique", "Avenir Book", "Avenir Book", "Avenir Heavy", "Avenir Heavy", "Avenir Light", "Avenir Light", "Avenir Medium", "Avenir Medium"},
		},
		{
			name:     "TTF file with single font",
			filename: "testdata/dummy.ttf",
			want:     []string{"Geneva"},
		},
		{
			name:     "Non-existent file",
			filename: "testdata/nonexistent.ttf",
			want:     nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getFontFamilyNames(tt.filename)
			
			sort.Strings(got)
			sort.Strings(tt.want)
			
			if len(got) != len(tt.want) {
				t.Fatalf("getFontFamilyNames() returned %d families, want %d: %v", len(got), len(tt.want), got)
			}
			
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("getFontFamilyNames() got[%d] = %v, want %v", i, got[i], tt.want[i])
				}
			}
		})
	}
}
