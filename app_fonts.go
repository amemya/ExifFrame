package main

import (
	"os"
	"sort"
	"strings"
	"sync"
	"github.com/adrg/sysfont"
	"golang.org/x/image/font/sfnt"
)

var (
	cachedFonts []string
	fontsOnce   sync.Once
)

// getFontFamilyName parses a font file (TTF/OTF) to extract its family name.
func getFontFamilyName(filename string) string {
	f, err := os.Open(filename)
	if err != nil {
		return ""
	}
	defer f.Close()

	font, err := sfnt.ParseReaderAt(f)
	if err != nil {
		return ""
	}

	name, err := font.Name(nil, sfnt.NameIDFamily)
	if err != nil {
		return ""
	}
	return name
}

// GetSystemFonts returns a list of installed system fonts (Family names).
func (a *App) GetSystemFonts() []string {
	fontsOnce.Do(func() {
		finder := sysfont.NewFinder(nil)
		fonts := finder.List()

		fontMap := make(map[string]bool)
		var uniqueFonts []string

		for _, f := range fonts {
			family := f.Family
			if family == "" && f.Filename != "" {
				family = getFontFamilyName(f.Filename)
			}
			
			if family != "" {
				lowerFamily := strings.ToLower(family)
				if !fontMap[lowerFamily] {
					fontMap[lowerFamily] = true
					uniqueFonts = append(uniqueFonts, family)
				}
			}
		}

		sort.Slice(uniqueFonts, func(i, j int) bool {
			return strings.ToLower(uniqueFonts[i]) < strings.ToLower(uniqueFonts[j])
		})
		
		cachedFonts = uniqueFonts
	})

	result := make([]string, len(cachedFonts))
	copy(result, cachedFonts)
	return result
}

