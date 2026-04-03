package main
import (
	"fmt"
	exif "github.com/dsoprea/go-exif/v3"
	pngstructure "github.com/dsoprea/go-png-image-structure/v2"
)
func main() {
	pmc := pngstructure.NewPngMediaParser()
	intfc, err := pmc.ParseFile("/Users/amemiya/ExifFrame/reference/_89R3840.png")
	if err != nil {
		fmt.Printf("err1: %v\n", err)
        return
	}

	cs := intfc.(*pngstructure.ChunkSlice)
	_, exifData, err := cs.Exif()
	if err != nil {
		fmt.Printf("err2: %v\n", err)
        return
	}

	im, err := exif.SearchAndExtractExif(exifData)
	if err != nil {
		fmt.Printf("err3: %v\n", err)
        return
	}
	
    entries, _, err := exif.GetFlatExifData(im, nil)
    for _, tag := range entries {
        fmt.Printf("%s: %s\n", tag.TagName, tag.Formatted)
    }
}
