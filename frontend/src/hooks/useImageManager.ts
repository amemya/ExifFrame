import { useState, useEffect, useCallback } from 'react';
import { ImportedImage, ExifData, ExifResult } from '../types';

export interface DefaultFrameSettings {
    frameColor: string;
    textColor: string;
    aspectRatioPreset: string;
    customRatioW: number;
    customRatioH: number;
    alignment: "top" | "center";
    showPipeSeparator: boolean;
    fontFamily: string;
}

/**
 * Manages images and EXIF data.
 * @param showToast Must be a stable function (e.g. wrapped in useCallback).
 * @param defaultSettings Global default settings applied to newly imported images.
 */
export function useImageManager(
    showToast: (msg: string, isError?: boolean) => void,
    defaultSettings: DefaultFrameSettings
) {
    const [importedImages, setImportedImages] = useState<ImportedImage[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [isCanvasReady, setIsCanvasReady] = useState(false);
    
    const [globalExif, setGlobalExif] = useState<ExifData>({
        camera: "", lens: "", focalLength: "", aperture: "", shutterSpeed: "", iso: "", film: "", developer: "", dilution: "", temperature: "", time: ""
    });

    const currentImage = importedImages[selectedIndex];
    const hasImages = importedImages.length > 0;
    const isCurrentImageLoaded = Boolean(currentImage?.imageObj);
    const imageObj = currentImage?.imageObj || null;
    const filePath = currentImage?.filePath || "";
    const sourceMimeType = currentImage?.sourceMimeType || "";
    const exif = currentImage?.exif || globalExif;

    const frameColor = currentImage?.frameColor ?? defaultSettings.frameColor;
    const textColor = currentImage?.textColor ?? defaultSettings.textColor;
    const currentOrientation = currentImage?.orientation ?? (imageObj && imageObj.height > imageObj.width ? "portrait" : "landscape");
    const currentAspectRatioPreset = currentImage?.aspectRatioPreset ?? defaultSettings.aspectRatioPreset;
    const currentCustomRatioW = currentImage?.customRatioW ?? defaultSettings.customRatioW;
    const currentCustomRatioH = currentImage?.customRatioH ?? defaultSettings.customRatioH;
    const currentAlignment = currentImage?.alignment ?? defaultSettings.alignment;
    const currentShowPipeSeparator = currentImage?.showPipeSeparator ?? defaultSettings.showPipeSeparator;
    const currentFontFamily = currentImage?.fontFamily ?? defaultSettings.fontFamily;

    const setPerImageSetting = useCallback(<K extends keyof ImportedImage>(key: K, value: ImportedImage[K]) => {
        setImportedImages(prev => {
            if (prev.length === 0) return prev;
            const newImages = [...prev];
            const current = newImages[selectedIndex];
            if (!current) return prev;
            newImages[selectedIndex] = { ...current, [key]: value };
            return newImages;
        });
    }, [selectedIndex]);

    const setPerImageOrientation = useCallback((orientation: "landscape" | "portrait") => setPerImageSetting('orientation', orientation), [setPerImageSetting]);
    const setFrameColor = useCallback((color: string) => setPerImageSetting('frameColor', color), [setPerImageSetting]);
    const setTextColor = useCallback((color: string) => setPerImageSetting('textColor', color), [setPerImageSetting]);
    const setPerImageAspectRatioPreset = useCallback((preset: string) => setPerImageSetting('aspectRatioPreset', preset), [setPerImageSetting]);
    const setPerImageCustomRatioW = useCallback((w: number) => setPerImageSetting('customRatioW', w), [setPerImageSetting]);
    const setPerImageCustomRatioH = useCallback((h: number) => setPerImageSetting('customRatioH', h), [setPerImageSetting]);
    const setPerImageAlignment = useCallback((alignment: "top" | "center") => setPerImageSetting('alignment', alignment), [setPerImageSetting]);
    const setPerImageShowPipeSeparator = useCallback((show: boolean) => setPerImageSetting('showPipeSeparator', show), [setPerImageSetting]);
    const setPerImageFontFamily = useCallback((fontFamily: string) => setPerImageSetting('fontFamily', fontFamily), [setPerImageSetting]);

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

    const currentImageURL = importedImages[selectedIndex]?.imageURL;
    const currentImageError = importedImages[selectedIndex]?.loadError;

    useEffect(() => {
        let isActive = true;
        if (!currentImageURL || isCurrentImageLoaded || currentImageError) {
            return;
        }

        const img = new Image();
        img.onload = () => {
            if (!isActive) return;
            setImportedImages(prev => {
                const newImages = [...prev];
                const idx = newImages.findIndex(item => item.imageURL === currentImageURL);
                if (idx !== -1) {
                    newImages[idx] = { ...newImages[idx], imageObj: img };
                }
                return newImages;
            });
        };
        img.onerror = () => {
            if (!isActive) return;
            showToast("Failed to load image preview", true);
            setImportedImages(prev => {
                const newImages = [...prev];
                const idx = newImages.findIndex(item => item.imageURL === currentImageURL);
                if (idx !== -1) {
                    newImages[idx] = { ...newImages[idx], loadError: true };
                }
                return newImages;
            });
        };
        img.src = currentImageURL;

        return () => {
            isActive = false;
        };
    }, [currentImageURL, isCurrentImageLoaded, currentImageError, showToast]);

    const { film, developer, dilution, temperature, time } = globalExif;

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

        setImportedImages(validResults.map(r => ({
            filePath: r.filePath || "",
            imageURL: r.imageURL!,
            sourceMimeType: r.mimeType?.toLowerCase().includes('png') ? 'image/png' : 'image/jpeg',
            originalBPP: r.originalBPP,
            imageObj: null,
            frameColor: defaultSettings.frameColor,
            textColor: defaultSettings.textColor,
            aspectRatioPreset: defaultSettings.aspectRatioPreset,
            customRatioW: defaultSettings.customRatioW,
            customRatioH: defaultSettings.customRatioH,
            alignment: defaultSettings.alignment,
            showPipeSeparator: defaultSettings.showPipeSeparator,
            fontFamily: defaultSettings.fontFamily,
            exif: {
                camera: r.camera || "",
                lens: r.lens || "",
                focalLength: r.focalLength || "",
                aperture: r.aperture || "",
                shutterSpeed: r.shutterSpeed || "",
                iso: r.iso || "",
                film,
                developer,
                dilution,
                temperature,
                time,
            }
        })));
        setSelectedIndex(0);
        setIsCanvasReady(false);
    }, [showToast, film, developer, dilution, temperature, time, defaultSettings]);

    const handleApplyToAll = useCallback(() => {
        if (importedImages.length === 0) return;
        setImportedImages(prev => prev.map(img => ({
            ...img,
            exif: { ...exif }
        })));
        showToast("Applied metadata to all images");
    }, [exif, importedImages.length, showToast]);

    const handleApplySettingsToAll = useCallback((scope: 'all' | 'colors' | 'ratios' | 'text') => {
        if (importedImages.length === 0) return;
        setImportedImages(prev => prev.map(img => {
            const newImg = { ...img };
            if (scope === 'all' || scope === 'colors') {
                newImg.frameColor = frameColor;
                newImg.textColor = textColor;
            }
            if (scope === 'all' || scope === 'ratios') {
                newImg.aspectRatioPreset = currentAspectRatioPreset;
                newImg.customRatioW = currentCustomRatioW;
                newImg.customRatioH = currentCustomRatioH;
                newImg.orientation = currentOrientation;
            }
            if (scope === 'all' || scope === 'text') {
                newImg.alignment = currentAlignment;
                newImg.showPipeSeparator = currentShowPipeSeparator;
                newImg.fontFamily = currentFontFamily;
            }
            return newImg;
        }));
        
        let scopeName = "All frame settings";
        if (scope === 'colors') scopeName = "Colors";
        else if (scope === 'ratios') scopeName = "Ratios & Orientation";
        else if (scope === 'text') scopeName = "Text formatting";
        
        showToast(`Applied ${scopeName.toLowerCase()} to all images`);
    }, [frameColor, textColor, currentAspectRatioPreset, currentCustomRatioW, currentCustomRatioH, currentOrientation, currentAlignment, currentShowPipeSeparator, currentFontFamily, importedImages.length, showToast]);

    return {
        importedImages, setImportedImages,
        selectedIndex, setSelectedIndex,
        currentImage, hasImages, isCurrentImageLoaded, imageObj, filePath, sourceMimeType, exif, setExif,
        frameColor, textColor, setFrameColor, setTextColor,
        currentOrientation, setPerImageOrientation,
        currentAspectRatioPreset, setPerImageAspectRatioPreset,
        currentCustomRatioW, setPerImageCustomRatioW,
        currentCustomRatioH, setPerImageCustomRatioH,
        currentAlignment, setPerImageAlignment,
        currentShowPipeSeparator, setPerImageShowPipeSeparator,
        currentFontFamily, setPerImageFontFamily,
        handleExifResults, handleApplyToAll, handleApplySettingsToAll,
        isCanvasReady, setIsCanvasReady
    };
}
