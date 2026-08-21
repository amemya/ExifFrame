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

// getFontFamilyNames parses a font file (TTF/OTF/TTC) to extract its family names.
func getFontFamilyNames(filename string) []string {
	f, err := os.Open(filename)
	if err != nil {
		return nil
	}
	defer f.Close()

	var families []string
	isTTC := strings.HasSuffix(strings.ToLower(filename), ".ttc")

	if isTTC {
		collection, err := sfnt.ParseCollectionReaderAt(f)
		if err != nil {
			return nil
		}
		numFonts := collection.NumFonts()
		for i := 0; i < numFonts; i++ {
			font, err := collection.Font(i)
			if err != nil {
				continue
			}
			name, err := font.Name(nil, sfnt.NameIDFamily)
			if err == nil && name != "" {
				families = append(families, name)
			}
		}
	} else {
		font, err := sfnt.ParseReaderAt(f)
		if err != nil {
			return nil
		}
		name, err := font.Name(nil, sfnt.NameIDFamily)
		if err == nil && name != "" {
			families = append(families, name)
		}
	}

	return families
}

// GetSystemFonts returns a list of installed system fonts (Family names).
func (a *App) GetSystemFonts() []string {
	fontsOnce.Do(func() {
		finder := sysfont.NewFinder(nil)
		fonts := finder.List()

		var uniqueFonts []string

		for _, f := range fonts {
			var families []string
			
			if f.Family != "" {
				families = append(families, f.Family)
			} else if f.Filename != "" {
				families = getFontFamilyNames(f.Filename)
			}
			
			for _, family := range families {
				if family != "" {
					isDuplicate := false
					for _, existing := range uniqueFonts {
						if strings.EqualFold(family, existing) {
							isDuplicate = true
							break
						}
					}
					if !isDuplicate {
						uniqueFonts = append(uniqueFonts, family)
					}
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

