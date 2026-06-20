import { useState, useRef, useEffect, useCallback } from 'react';
import { ImportedImage, ExifData, ExifResult } from '../types';
/**
 * Manages images and EXIF data.
 * @param showToast Must be a stable function (e.g. wrapped in useCallback).
 * @param setGlobalFrameColor Must be a stable function.
 * @param setGlobalTextColor Must be a stable function.
 * @param setOrientation Must be a stable function.
 */
export function useImageManager(
    showToast: (msg: string, isError?: boolean) => void,
    globalFrameColor: string,
    globalTextColor: string,
    setGlobalFrameColor: (v: string) => void,
    setGlobalTextColor: (v: string) => void,
    setOrientation: (v: "landscape" | "portrait") => void
) {
    const [importedImages, setImportedImages] = useState<ImportedImage[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [isCanvasReady, setIsCanvasReady] = useState(false);
    
    const [globalExif, setGlobalExif] = useState<ExifData>({
        camera: "", lens: "", focalLength: "", aperture: "", shutterSpeed: "", iso: "", film: "", developer: "", dilution: "", temperature: "", time: ""
    });

    const currentImage = importedImages[selectedIndex];
    const hasImages = importedImages.length > 0;
    const isCurrentImageLoaded = currentImage?.imageObj !== null;
    const imageObj = currentImage?.imageObj || null;
    const filePath = currentImage?.filePath || "";
    const sourceMimeType = currentImage?.sourceMimeType || "";
    const exif = currentImage?.exif || globalExif;

    const frameColor = currentImage?.frameColor ?? globalFrameColor;
    const textColor = currentImage?.textColor ?? globalTextColor;

    const setExif: React.Dispatch<React.SetStateAction<ExifData>> = useCallback((action) => {
        setImportedImages(prev => {
            if (prev.length === 0) {
                setGlobalExif(action);
                return prev;
            }
            const newImages = [...prev];
            const current = newImages[selectedIndex];
            if (!current) return prev;
            const updatedExif = typeof action === 'function' ? action(current.exif) : action;
            newImages[selectedIndex] = { ...current, exif: updatedExif };
            return newImages;
        });
    }, [selectedIndex]);

    const setPerImageColor = useCallback((key: 'frameColor' | 'textColor', globalSetter: (v: string) => void, color: string) => {
        setImportedImages(prev => {
            if (prev.length === 0) {
                globalSetter(color);
                return prev;
            }
            const newImages = [...prev];
            const current = newImages[selectedIndex];
            if (!current) return prev;
            newImages[selectedIndex] = { ...current, [key]: color };
            return newImages;
        });
    }, [selectedIndex]);

    const setFrameColor = useCallback((color: string) => setPerImageColor('frameColor', setGlobalFrameColor, color), [setPerImageColor, setGlobalFrameColor]);
    const setTextColor = useCallback((color: string) => setPerImageColor('textColor', setGlobalTextColor, color), [setPerImageColor, setGlobalTextColor]);

    const importedImagesRef = useRef(importedImages);
    importedImagesRef.current = importedImages;
    const currentImageURL = importedImages[selectedIndex]?.imageURL;
    const currentImageLoaded = Boolean(importedImages[selectedIndex]?.imageObj);
    const currentImageError = importedImages[selectedIndex]?.loadError;

    useEffect(() => {
        const images = importedImagesRef.current;
        const current = images[selectedIndex];
        if (current && !current.imageObj && !current.loadError) {
            const img = new Image();
            img.onload = () => {
                setImportedImages(prev => {
                    const newImages = [...prev];
                    const idx = newImages.findIndex(item => item.imageURL === current.imageURL);
                    if (idx !== -1) {
                        newImages[idx] = { ...newImages[idx], imageObj: img };
                    }
                    return newImages;
                });
                setOrientation(img.height > img.width ? "portrait" : "landscape");
            };
            img.onerror = () => {
                showToast("Failed to load image preview", true);
                setImportedImages(prev => {
                    const newImages = [...prev];
                    const idx = newImages.findIndex(item => item.imageURL === current.imageURL);
                    if (idx !== -1) {
                        newImages[idx] = { ...newImages[idx], loadError: true };
                    }
                    return newImages;
                });
            };
            img.src = current.imageURL;
        } else if (current && current.imageObj) {
            setOrientation(current.imageObj.height > current.imageObj.width ? "portrait" : "landscape");
        }
    }, [selectedIndex, currentImageURL, currentImageLoaded, currentImageError, showToast, setOrientation]);

    const handleExifResults = useCallback((results: ExifResult[]) => {
        const validResults = results.filter(r => !r.cancelled && !r.error && r.imageURL);
        if (validResults.length === 0) {
            const firstError = results.find(r => r.error);
            if (firstError && firstError.error) {
                console.error(firstError.error);
                showToast(firstError.error, true);
            }
            return;
        }

        setImportedImages(() => {
            const newImages: ImportedImage[] = validResults.map(r => ({
                filePath: r.filePath || "",
                imageURL: r.imageURL!,
                sourceMimeType: r.mimeType && r.mimeType.includes('png') ? 'image/png' : 'image/jpeg',
                originalBPP: r.originalBPP,
                imageObj: null,
                exif: {
                    camera: r.camera || "",
                    lens: r.lens || "",
                    focalLength: r.focalLength || "",
                    aperture: r.aperture || "",
                    shutterSpeed: r.shutterSpeed || "",
                    iso: r.iso || "",
                    film: globalExif.film,
                    developer: globalExif.developer,
                    dilution: globalExif.dilution,
                    temperature: globalExif.temperature,
                    time: globalExif.time,
                }
            }));
            return newImages;
        });
        setSelectedIndex(0);
        setIsCanvasReady(false);
    }, [showToast, globalExif]);

    const handleApplyToAll = useCallback(() => {
        if (importedImages.length === 0) return;
        setImportedImages(prev => prev.map(img => ({
            ...img,
            exif: { ...exif }
        })));
        showToast("Applied metadata to all images");
    }, [exif, importedImages.length, showToast]);

    const handleApplyColorsToAll = useCallback(() => {
        if (importedImages.length === 0) return;
        setImportedImages(prev => prev.map(img => ({
            ...img,
            frameColor,
            textColor
        })));
        showToast("Applied colors to all images");
    }, [frameColor, textColor, importedImages.length, showToast]);

    return {
        importedImages, setImportedImages,
        selectedIndex, setSelectedIndex,
        currentImage, hasImages, isCurrentImageLoaded, imageObj, filePath, sourceMimeType, exif, setExif,
        frameColor, textColor, setFrameColor, setTextColor,
        handleExifResults, handleApplyToAll, handleApplyColorsToAll,
        isCanvasReady, setIsCanvasReady
    };
}
