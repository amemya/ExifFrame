import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI, Settings } from '../bindings/ExifFrame/index';
import { Window, Events, System, Call, Browser } from '@wailsio/runtime';

interface UpdateInfo {
    updateAvailable: boolean;
    latestVersion: string;
    releaseNotes: string;
    url: string;
}
import { ExifData, MetadataVisibility, toVisibility, applyVisibility, ImportedImage, ExifResult } from './types';
import { FrameSettingsPanel } from './components/FrameSettingsPanel';
import { MetadataSettingsPanel } from './components/MetadataSettingsPanel';
import { useToast } from './hooks/useToast';
import { getQualityFromBPP, getExportInfo } from './utils';
import { renderImageToCanvas } from './canvas';

// Re-export for backward compatibility
export { getQualityFromBPP } from './utils';


interface ProcessFileResult {
    imageURL?: string;
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutterSpeed?: string;
    iso?: string;
    mimeType?: string;
    filePath?: string;
    originalBPP?: number;
}

interface ProcessFileData {
    result?: ProcessFileResult;
    export?: string;
}

interface WailsProcessFileEvent {
    data: ProcessFileData[] | ProcessFileData;
}

function App() {
    const [watchFolder, setWatchFolder] = useState("");
    const [exportFolder, setExportFolder] = useState("");

    const [profile, setProfile] = useState<string>("digital");

    useEffect(() => {
        const unsubProcess = Events.On("process_file", (event: WailsProcessFileEvent) => {
            if (!event?.data) return;
            // Handle both Wails v2 (array) and Wails v3 (single object) format:
            // - Wails v2 wraps arguments in an array: [{ result, export }]
            // - Wails v3 passes single arguments directly: { result, export }
            // We pick the first element if it's an array to support v2 payloads.
            const data = Array.isArray(event.data) ? event.data[0] : event.data;
            if (!data || !data.result) {
                if (Array.isArray(event.data) && event.data.length === 0) {
                    console.warn("process_file event received empty array");
                }
                return;
            }
            const { result, export: exportFolderStr } = data;
            const imageUrl = result.imageURL;
            if (!imageUrl || !exportFolderStr) return;

            AppAPI.GetSettings().then(async (currentSet: Settings) => {
                const img = new Image();
                img.onload = async () => {
                    const offscreenCanvas = document.createElement('canvas');

                    const override = currentSet.overrideExif;
                    
                    const pick = (settingsVal: string | undefined, exifVal: string | undefined) => 
                        override && settingsVal ? settingsVal : exifVal || "";

                    const exifData = {
                        camera: pick(currentSet.camera, result.camera),
                        lens: pick(currentSet.lens, result.lens),
                        focalLength: pick(currentSet.focalLength, result.focalLength),
                        aperture: pick(currentSet.aperture, result.aperture),
                        shutterSpeed: pick(currentSet.shutterSpeed, result.shutterSpeed),
                        iso: pick(currentSet.iso, result.iso),
                        film: currentSet.film || "",
                        developer: currentSet.developer || "",
                        dilution: currentSet.dilution || "",
                        temperature: currentSet.temperature || "",
                        time: currentSet.time || ""
                    };

                    renderImageToCanvas(offscreenCanvas, img, exifData, {
                        aspectRatioPreset: currentSet.aspectRatioPreset || "4300:3618",
                        customRatioW: currentSet.customRatioW || 4300,
                        customRatioH: currentSet.customRatioH || 3618,
                        orientation: (currentSet.orientation as any) || "landscape",
                        alignment: (currentSet.alignment as any) || "top",
                        showPipeSeparator: currentSet.showPipeSeparator ?? true,
                        profile: currentSet.profile || "digital",
                        visibility: toVisibility(currentSet),
                        frameColor: currentSet.frameColor || "#ffffff",
                        textColor: currentSet.textColor || "#000000"
                    });

                    const { isPng, targetMime, exportName } = getExportInfo(result.filePath || "", result.mimeType || "");

                    const savePath = exportFolderStr + "/" + exportName;

                    const quality = getQualityFromBPP(result.originalBPP, currentSet.jpegQuality || "auto");
                    offscreenCanvas.toBlob(async (blob) => {
                        if (!blob) return;
                        try {
                            const resultSave = await AppAPI.SaveAutoImage(isPng, savePath);
                            if (resultSave.saveToken) {
                                const arrayBuffer = await blob.arrayBuffer();
                                const resp = await fetch(`/api/save?token=${encodeURIComponent(resultSave.saveToken)}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': targetMime },
                                    body: arrayBuffer,
                                });
                                if (!resp.ok) {
                                    const errText = await resp.text();
                                    console.error("Background save failed:", resp.status, errText);
                                } else {
                                    console.log("Background save complete:", savePath);
                                }
                            } else {
                                console.error("Auto save failed:", resultSave.error);
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }, targetMime, quality);
                };
                img.onerror = () => {
                    console.error("Background image load failed:", imageUrl);
                };
                img.src = imageUrl;
            }).catch((e: any) => console.error(e));
        });

        return () => {
            unsubProcess();
        };
    }, []);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [importedImages, setImportedImages] = useState<ImportedImage[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(0);

    const currentImage = importedImages[selectedIndex];
    const hasImages = importedImages.length > 0;
    const isCurrentImageLoaded = currentImage?.imageObj !== null;
    const imageLoaded = hasImages && isCurrentImageLoaded;
    const imageObj = currentImage?.imageObj || null;
    const filePath = currentImage?.filePath || "";
    const sourceMimeType = currentImage?.sourceMimeType || "";
    const exif = currentImage?.exif || {
        camera: "", lens: "", focalLength: "", aperture: "", shutterSpeed: "", iso: "", film: "", developer: "", dilution: "", temperature: "", time: ""
    };

    const setExif: React.Dispatch<React.SetStateAction<ExifData>> = useCallback((action) => {
        setImportedImages(prev => {
            if (prev.length === 0) return prev;
            const newImages = [...prev];
            const current = newImages[selectedIndex];
            if (!current) return prev;
            const updatedExif = typeof action === 'function' ? action(current.exif) : action;
            newImages[selectedIndex] = { ...current, exif: updatedExif };
            return newImages;
        });
    }, [selectedIndex]);

    const [visibility, setVisibility] = useState<MetadataVisibility>({
        camera: true,
        lens: true,
        focalLength: true,
        aperture: true,
        shutterSpeed: true,
        iso: true,
        film: true,
        developer: true,
        dilution: true,
        temperature: true,
        time: true
    });

    const [isSelecting, setIsSelecting] = useState(false);
    const isSelectingRef = useRef(false);
    const isInitialLoad = useRef(true);
    const [isMac, setIsMac] = useState(false);
    const toast = useToast();
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    
    // Dropdown states
    const [exportMenuVisible, setExportMenuVisible] = useState(false);

    // Canvas state
    const [isCanvasReady, setIsCanvasReady] = useState(false);

    // Frame styling state
    const [aspectRatioPreset, setAspectRatioPreset] = useState<string>("4300:3618");
    const [customRatioW, setCustomRatioW] = useState<number>(4300);
    const [customRatioH, setCustomRatioH] = useState<number>(3618);
    const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
    const [alignment, setAlignment] = useState<"top" | "center">("top");
    const [showPipeSeparator, setShowPipeSeparator] = useState<boolean>(true);
    const [globalFrameColor, setGlobalFrameColor] = useState<string>("#ffffff");
    const [globalTextColor, setGlobalTextColor] = useState<string>("#000000");
    const [globalJpegQuality, setGlobalJpegQuality] = useState<string>("auto");

    const frameColor = currentImage?.frameColor ?? globalFrameColor;
    const textColor = currentImage?.textColor ?? globalTextColor;

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

    const setFrameColor = useCallback((color: string) => setPerImageColor('frameColor', setGlobalFrameColor, color), [setPerImageColor]);
    const setTextColor = useCallback((color: string) => setPerImageColor('textColor', setGlobalTextColor, color), [setPerImageColor]);

    const showToast = toast.show;

    // Use a ref to access importedImages without adding it to the dependency array.
    // This prevents the effect from re-running when any image finishes loading.
    const importedImagesRef = useRef(importedImages);
    importedImagesRef.current = importedImages;

    // Derive the current image URL to use as a stable dependency
    const currentImageURL = importedImages[selectedIndex]?.imageURL;
    const currentImageLoaded = importedImages[selectedIndex]?.imageObj !== null;
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
    }, [selectedIndex, currentImageURL, currentImageLoaded, currentImageError, showToast]);

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
                sourceMimeType: (r.mimeType as 'image/jpeg' | 'image/png') || 'image/jpeg',
                originalBPP: r.originalBPP,
                imageObj: null,
                exif: {
                    camera: r.camera || "",
                    lens: r.lens || "",
                    focalLength: r.focalLength || "",
                    aperture: r.aperture || "",
                    shutterSpeed: r.shutterSpeed || "",
                    iso: r.iso || "",
                    film: "",
                    developer: "",
                    dilution: "",
                    temperature: "",
                    time: "",
                }
            }));
            return newImages;
        });
        setSelectedIndex(0);
        setIsCanvasReady(false);
    }, [showToast]);

    const handleApplyToAll = useCallback(() => {
        if (importedImages.length === 0) return;
        setImportedImages(prev => prev.map(img => ({
            ...img,
            exif: { ...exif } // copy
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

    useEffect(() => {
        // Check for updates
        AppAPI.CheckForUpdates().then((info: UpdateInfo) => {
            if (info && info.updateAvailable) {
                setUpdateInfo(info);
            }
        }).catch((err: Error) => console.error("Update check failed:", err));
    }, []);

    useEffect(() => {
        // Load settings on mount
        AppAPI.GetSettings().then((s: Settings) => {
            if (s.watchFolder) setWatchFolder(s.watchFolder);
            if (s.exportFolder) setExportFolder(s.exportFolder);
            if (s.aspectRatioPreset) setAspectRatioPreset(s.aspectRatioPreset);
            if (s.customRatioW) setCustomRatioW(s.customRatioW);
            if (s.customRatioH) setCustomRatioH(s.customRatioH);
            if (s.orientation) setOrientation(s.orientation as any);
            if (s.alignment) setAlignment(s.alignment as any);
            if (s.showPipeSeparator !== undefined) setShowPipeSeparator(s.showPipeSeparator);
            if (s.frameColor) setGlobalFrameColor(s.frameColor);
            if (s.textColor) setGlobalTextColor(s.textColor);
            if (s.jpegQuality) setGlobalJpegQuality(s.jpegQuality);
            if (s.profile) {
                setProfile(['digital', 'film'].includes(s.profile) ? s.profile : 'digital');
            }

            setExif(prev => ({
                ...prev,
                film: s.film || "",
                developer: s.developer || "",
                dilution: s.dilution || "",
                temperature: s.temperature || "",
                time: s.time || ""
            }));

            setVisibility(toVisibility(s));
        }).catch((err: any) => {
            console.error("Failed to load settings:", err);
        }).finally(() => {
            // Allow short delay before enabling auto-save to prevent initial trigger
            setTimeout(() => {
                isInitialLoad.current = false;
            }, 100);
        });

        const unsubSettings = Events.On("settings_saved", () => {
            AppAPI.GetSettings().then((s: Settings) => {
                if (s.watchFolder) setWatchFolder(s.watchFolder);
                else setWatchFolder("");
                if (s.exportFolder) setExportFolder(s.exportFolder);
                else setExportFolder("");
                if (s.jpegQuality) setGlobalJpegQuality(s.jpegQuality);
                else setGlobalJpegQuality("auto");
            }).catch((err: any) => {
                console.error("Failed to reload settings:", err);
            });
        });

        const offFilesDropped = Events.On("files-dropped", async (e: any) => {
            let files: string[] = [];
            if (Array.isArray(e.data)) {
                // In Wails v3, emitted arguments might be in e.data array, so check if e.data[0] is the actual files array
                if (e.data.length > 0 && Array.isArray(e.data[0])) {
                    files = e.data[0];
                } else {
                    files = e.data;
                }
            }
            
            if (files.length > 0) {
                if (isSelectingRef.current) return;
                isSelectingRef.current = true;
                setIsSelecting(true);
                try {
                    const results = await AppAPI.ProcessPaths(files);
                    handleExifResults(results);
                } catch (err: any) {
                    console.error("Failed to process dropped files:", err);
                    showToast("Failed to process files: " + (err instanceof Error ? err.message : String(err)), true);
                } finally {
                    setIsSelecting(false);
                    isSelectingRef.current = false;
                }
            }
        });

        return () => {
            unsubSettings();
            offFilesDropped();
        };
    }, [handleExifResults]);
    const handleSaveAutoExportDefault = async () => {
        const s = new Settings();
        s.watchFolder = watchFolder;
        s.exportFolder = exportFolder;
        s.aspectRatioPreset = aspectRatioPreset;
        s.customRatioW = customRatioW;
        s.customRatioH = customRatioH;
        s.orientation = orientation;
        s.alignment = alignment;
        s.showPipeSeparator = showPipeSeparator;
        s.profile = profile;
        s.frameColor = frameColor;
        s.textColor = textColor;
        // In App.tsx (manual view), we don't have an overrideExif toggle. 
        // We probably shouldn't overwrite overrideExif if we don't have it in state,
        // so let's preserve it from the current global settings before saving.

        try {
            const currentSettings = await AppAPI.GetSettings();
            s.overrideExif = currentSettings.overrideExif;
            s.jpegQuality = currentSettings.jpegQuality || "auto";
        } catch (e) {
            s.overrideExif = false;
            s.jpegQuality = "auto";
        }

        s.camera = exif.camera;
        s.lens = exif.lens;
        s.focalLength = exif.focalLength;
        s.aperture = exif.aperture;
        s.shutterSpeed = exif.shutterSpeed;
        s.iso = exif.iso;
        s.film = exif.film;
        s.developer = exif.developer;
        s.dilution = exif.dilution;
        s.temperature = exif.temperature;
        s.time = exif.time;

        applyVisibility(s, visibility);

        try {
            const errStr = await AppAPI.SaveSettings(s);
            if (errStr && errStr !== "") {
                showToast(errStr, true);
            } else {
                showToast("Auto-export default saved");
            }
        } catch (e: any) {
            showToast("Error saving settings", true);
        }
    };

    const handleOpenImages = useCallback(async (
        openFn: () => Promise<ExifResult[]>,
        errorLabel: string
    ) => {
        if (isSelectingRef.current) return;
        isSelectingRef.current = true;
        setIsSelecting(true);
        try {
            const results = await openFn();
            handleExifResults(results);
        } catch (err: any) {
            console.error(`Failed to ${errorLabel}:`, err);
            showToast(`Failed to ${errorLabel}: ` + (err instanceof Error ? err.message : String(err)), true);
        } finally {
            setIsSelecting(false);
            isSelectingRef.current = false;
        }
    }, [handleExifResults, showToast]);

    const handleAddFiles = useCallback(
        () => handleOpenImages(() => AppAPI.OpenImages(), "open images"),
        [handleOpenImages]
    );

    useEffect(() => {
        setIsMac(System.IsMac());
    }, []);


    const drawCanvas = useCallback((img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        renderImageToCanvas(canvas, img, exif, {
            aspectRatioPreset,
            customRatioW,
            customRatioH,
            orientation,
            alignment,
            showPipeSeparator,
            profile,
            visibility,
            frameColor,
            textColor
        });
        setIsCanvasReady(true);
    }, [exif, aspectRatioPreset, customRatioW, customRatioH, orientation, alignment, showPipeSeparator, profile, visibility, frameColor, textColor]);

    useEffect(() => {
        if (!canvasRef.current) return;

        if (imageObj) {
            drawCanvas(imageObj);
        }
        // If imageObj is null, we do NOTHING. 
        // The canvas natively holds its previous pixels, acting as a seamless placeholder.
    }, [imageObj, drawCanvas]);

    const downloadImage = async () => {
        if (!canvasRef.current || !imageObj) return;

        try {
            // Determine format from the actual MIME type detected by Go.
            // If the source was a PNG, maintain lossless export.
            const { isPng, targetMime, baseName } = getExportInfo(filePath, sourceMimeType);
            const exportName = `${baseName}_ExifFrame`;

            // Step 1: Open native save dialog via IPC (no binary data transferred)
            const result = await AppAPI.SaveImage(isPng, exportName);

            if (result.cancelled) {
                return;
            }
            if (result.error) {
                console.error("Export failed:", result.error);
                showToast("Failed to save image: " + result.error, true);
                return;
            }

            const quality = getQualityFromBPP(currentImage.originalBPP, globalJpegQuality);
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvasRef.current!.toBlob(
                    (b) => b ? resolve(b) : reject(new Error("toBlob returned null")),
                    targetMime,
                    quality
                );
            });

            const arrayBuffer = await blob.arrayBuffer();

            const response = await fetch(`/api/save?token=${result.saveToken}`, {
                method: 'POST',
                body: arrayBuffer,
                headers: { 'Content-Type': targetMime }
            });

            if (!response.ok) {
                const text = await response.text();
                console.error("HTTP POST failed for", exportName, text);
                showToast("Save failed: " + text, true);
                return;
            }
            showToast("Export complete!");
        } catch (err) {
            console.error("Failed to execute SaveImage:", err);
            showToast("Failed to save image", true);
        }
    };

    const downloadAllImages = async () => {
        if (importedImages.length === 0) return;
        isSelectingRef.current = true;
        let successCount = 0;
        let failCount = 0;

        try {
            const exportDir = await AppAPI.SelectExportFolder();
            if (!exportDir) {
                setIsSelecting(false);
                isSelectingRef.current = false;
                return; // Cancelled
            }

            showToast("Exporting images...");
            setIsSelecting(true);

            for (let i = 0; i < importedImages.length; i++) {
                try {
                    const imgState = importedImages[i];
                    let imgToDraw = imgState.imageObj;
                    
                    if (!imgToDraw) {
                        try {
                            imgToDraw = await new Promise<HTMLImageElement>((resolve, reject) => {
                                const tempImg = new Image();
                                tempImg.onload = () => resolve(tempImg);
                                tempImg.onerror = () => reject(new Error("Failed to load image"));
                                tempImg.src = imgState.imageURL;
                            });
                        } catch (e) {
                            console.error("Failed to load image for export:", e);
                            failCount++;
                            continue;
                        }
                    }

                    const offCanvas = document.createElement("canvas");
                    renderImageToCanvas(offCanvas, imgToDraw, imgState.exif, {
                        aspectRatioPreset,
                        customRatioW,
                        customRatioH,
                        orientation: imgToDraw.height > imgToDraw.width ? "portrait" : "landscape",
                        alignment,
                        showPipeSeparator,
                        profile,
                        visibility,
                        frameColor: imgState.frameColor ?? globalFrameColor,
                        textColor: imgState.textColor ?? globalTextColor
                    });

                    const { isPng, targetMime, baseName } = getExportInfo(imgState.filePath || `exif-frame-${i}`, imgState.sourceMimeType);
                    const exportName = `${baseName}_ExifFrame`;
                    
                    const result = await AppAPI.SaveBatchImage(isPng, exportDir, exportName);
                    if (result.error) {
                        console.error("Export failed for", exportName, result.error);
                        failCount++;
                        continue;
                    }

                    const blob = await new Promise<Blob>((resolve, reject) => {
                        const quality = getQualityFromBPP(imgState.originalBPP, globalJpegQuality);
                        offCanvas.toBlob(
                            (b) => b ? resolve(b) : reject(new Error("toBlob returned null")),
                            targetMime,
                            quality
                        );
                    });

                    const arrayBuffer = await blob.arrayBuffer();

                    const response = await fetch(`/api/save?token=${result.saveToken}`, {
                        method: 'POST',
                        body: arrayBuffer,
                        headers: { 'Content-Type': targetMime }
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        console.error("Save failed:", text);
                        failCount++;
                        continue;
                    }
                    
                    successCount++;
                } catch (e) {
                    console.error("Unexpected error processing image", i, e);
                    failCount++;
                }
            }
            
            if (failCount > 0) {
                showToast(`Export complete: ${successCount} succeeded, ${failCount} failed.`, true);
            } else {
                showToast(`Successfully exported all ${successCount} images.`);
            }
        } catch (err: any) {
            const errStr = err instanceof Error ? err.message : String(err);
            console.error("Failed to export all:", errStr);
            showToast("Failed to export all: " + errStr, true);
        } finally {
            setIsSelecting(false);
            isSelectingRef.current = false;
        }
    };

    return (
        <div className={`app-container ${isMac ? 'mac-os' : ''}`}>
            <header className="top-bar" onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                Window.Get("").ToggleMaximise();
            }}>
                <div className="top-bar-left">
                    <h1>ExifFrame</h1>
                    {updateInfo && (
                        <button 
                            className="btn btn-update" 
                            onClick={() => Browser.OpenURL(updateInfo.url).catch((err: Error) => {
                                console.error("Failed to open URL via Wails:", err);
                                window.open(updateInfo.url, '_blank');
                            })}
                            title="A new version is available!"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Update to {updateInfo.latestVersion}
                        </button>
                    )}
                    {filePath && <span className="file-path">{filePath.split(/[/\\]/).filter(Boolean).join(' > ')}</span>}
                </div>
                <div className="top-bar-actions">
                    <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => Call.ByName("main.App.OpenSettingsWindow")}
                        title="Settings"
                        aria-label="Settings"
                    >
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button className="btn btn-secondary" onClick={handleAddFiles} disabled={isSelecting}>
                        Open
                    </button>
                    {hasImages && (
                        <div className="btn-group">
                            <button className="btn btn-primary" onClick={downloadImage} disabled={isSelecting || !isCurrentImageLoaded}>
                                Export
                            </button>
                            {importedImages.length > 1 && (
                                <div 
                                    className="dropdown"
                                    tabIndex={-1}
                                    onBlur={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                            setExportMenuVisible(false);
                                        }
                                    }}
                                >
                                    <button 
                                        className="btn btn-primary dropdown-toggle" 
                                        aria-label="More export options" 
                                        disabled={isSelecting}
                                        onClick={() => setExportMenuVisible(v => !v)}
                                    >
                                        ▼
                                    </button>
                                    {exportMenuVisible && (
                                        <div className="dropdown-menu">
                                            <button className="dropdown-item" onClick={() => { setExportMenuVisible(false); downloadAllImages(); }}>Export All</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <main className="workspace">
                <div 
                    className="preview-area"
                    data-file-drop-target="true"
                >
                    <div className="drop-overlay">
                        <div className="drop-overlay-text">Drop image here</div>
                    </div>
                    {!hasImages ? (
                        <div
                            className={`empty-state ${isSelecting ? 'selecting' : ''}`}
                            onClick={isSelecting ? undefined : handleAddFiles}
                            role="button"
                            tabIndex={isSelecting ? -1 : 0}
                            aria-label={isSelecting ? "Opening..." : "Click or press Enter to open"}
                            aria-busy={isSelecting}
                            aria-disabled={isSelecting}
                            onKeyDown={(e) => {
                                if (isSelecting) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault(); // Prevent page scroll for Space
                                    handleAddFiles();
                                }
                            }}
                        >
                            {isSelecting ? (
                                <>
                                    <svg className="spinner" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }} aria-hidden="true">
                                        <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                                    </svg>
                                    <p>Processing images...</p>
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', color: 'var(--text-tertiary)' }} aria-hidden="true">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>
                                    </svg>
                                    <p>Drop files/folders here or click to open</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="canvas-wrapper" style={{ position: 'relative' }}>
                            <canvas 
                                ref={canvasRef} 
                                className={`preview-canvas ${!isCanvasReady ? 'hidden-canvas' : ''} ${!isCurrentImageLoaded ? 'loading' : ''}`}
                                style={{ 
                                    pointerEvents: isCurrentImageLoaded ? 'auto' : 'none'
                                }} 
                            />
                            <div className={`loading-overlay ${!isCurrentImageLoaded && isCanvasReady ? 'visible' : ''}`}>
                                <svg className="spinner" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }} aria-hidden="true">
                                    <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                                </svg>
                                <span>Loading...</span>
                            </div>
                        </div>
                    )}

                    {importedImages.length > 0 && (
                        <div className="filmstrip-area">
                            {importedImages.map((img, idx) => (
                                <button 
                                    key={idx} 
                                    type="button"
                                    className={`filmstrip-item ${selectedIndex === idx ? 'selected' : ''}`}
                                    onClick={() => setSelectedIndex(idx)}
                                >
                                    <img id={`thumb-${idx}`} src={img.imageURL} alt={`Thumbnail ${idx}`} loading="lazy" draggable={false} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {hasImages && (
                    <aside className="sidebar">
                        <FrameSettingsPanel
                            aspectRatioPreset={aspectRatioPreset} setAspectRatioPreset={setAspectRatioPreset}
                            customRatioW={customRatioW} setCustomRatioW={setCustomRatioW}
                            customRatioH={customRatioH} setCustomRatioH={setCustomRatioH}
                            orientation={orientation} setOrientation={setOrientation}
                            alignment={alignment} setAlignment={setAlignment}
                            showPipeSeparator={showPipeSeparator} setShowPipeSeparator={setShowPipeSeparator}
                            frameColor={frameColor} setFrameColor={setFrameColor}
                            textColor={textColor} setTextColor={setTextColor}
                            onApplyToAllColors={importedImages.length > 1 ? handleApplyColorsToAll : undefined}
                        />

                        <MetadataSettingsPanel
                            profile={profile} setProfile={setProfile}
                            exif={exif} setExif={setExif}
                            visibility={visibility} setVisibility={setVisibility}
                            onApplyToAll={importedImages.length > 1 ? handleApplyToAll : undefined}
                        />

                        <div className="sidebar-section default-settings-section" style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                onClick={handleSaveAutoExportDefault}
                                title="Save current settings as default for auto-processing"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                Save as Auto-Export Default
                            </button>
                        </div>
                    </aside>
                )}

                    {toast.element}
            </main>

        </div>
    );
}

export default App;
