import { RefObject, MutableRefObject, useEffect, useRef } from 'react';
// @ts-expect-error generated bindings
import { App as AppAPI } from '../../bindings/ExifFrame/index';
import { ImportedImage, MetadataVisibility } from '../types';
import { getExportInfo, getQualityFromBPP } from '../utils';
import { renderImageToCanvas } from '../canvas';

export interface UseExportProps {
    canvasRef: RefObject<HTMLCanvasElement>;
    imageObj: HTMLImageElement | null;
    currentImage: ImportedImage;
    importedImages: ImportedImage[];
    isSelectingRef: MutableRefObject<boolean>;
    setIsSelecting: (v: boolean) => void;
    showToast: (msg: string, isError?: boolean) => void;
    
    aspectRatioPreset: string;
    customRatioW: number;
    customRatioH: number;
    orientation: "landscape" | "portrait";
    alignment: "top" | "center";
    showPipeSeparator: boolean;
    profile: string;
    visibility: MetadataVisibility;
    globalFrameColor: string;
    globalTextColor: string;
    globalJpegQuality: string;
}

const uploadCanvasBlob = async (
    canvas: HTMLCanvasElement,
    targetMime: string,
    quality: number | undefined,
    saveToken: string
) => {
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => b ? resolve(b) : reject(new Error("toBlob returned null")),
            targetMime,
            quality
        );
    });
    const arrayBuffer = await blob.arrayBuffer();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(`/api/save?token=${encodeURIComponent(saveToken)}`, {
            method: 'POST',
            body: arrayBuffer,
            headers: { 'Content-Type': targetMime },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text);
        }
    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            throw new Error("Timeout");
        }
        throw e;
    }
};

export function useExport({
    canvasRef, imageObj, currentImage, importedImages,
    isSelectingRef, setIsSelecting, showToast,
    aspectRatioPreset, customRatioW, customRatioH, orientation,
    alignment, showPipeSeparator, profile, visibility,
    globalFrameColor, globalTextColor, globalJpegQuality
}: UseExportProps) {
    
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const downloadImage = async () => {
        if (!canvasRef.current || !imageObj) return;

        try {
            const { isPng, targetMime, baseName } = getExportInfo(currentImage.filePath || "exif-frame-export", currentImage.sourceMimeType);
            const exportName = `${baseName}_ExifFrame`;

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
            
            try {
                await uploadCanvasBlob(canvasRef.current, targetMime, quality, result.saveToken);
                if (isMounted.current) showToast("Export complete!");
            } catch (err: any) {
                console.error("HTTP POST failed for", exportName, err);
                if (isMounted.current) showToast("Save failed: " + (err instanceof Error ? err.message : String(err)), true);
            }
        } catch (err) {
            console.error("Failed to execute SaveImage:", err);
            if (isMounted.current) showToast("Failed to save image", true);
        }
    };

    const downloadAllImages = async () => {
        if (importedImages.length === 0) return;
        if (isSelectingRef.current) return;
        
        isSelectingRef.current = true;
        let exportDir = "";
        try {
            exportDir = await AppAPI.SelectExportFolder();
        } catch (e) {
            isSelectingRef.current = false;
            return;
        }

        if (!exportDir) {
            isSelectingRef.current = false;
            return; // Cancelled
        }

        setIsSelecting(true);
        let successCount = 0;
        let failCount = 0;

        try {
            if (isMounted.current) showToast("Exporting images...");

            for (let i = 0; i < importedImages.length; i++) {
                if (!isMounted.current) break;
                let imgToDraw: HTMLImageElement | null = null;
                let offCanvas: HTMLCanvasElement | null = null;
                try {
                    const imgState = importedImages[i];
                    imgToDraw = imgState.imageObj;
                    
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

                    offCanvas = document.createElement("canvas");
                    renderImageToCanvas(offCanvas, imgToDraw, imgState.exif, {
                        aspectRatioPreset,
                        customRatioW,
                        customRatioH,
                        orientation: imgState.orientation || (imgToDraw.height > imgToDraw.width ? "portrait" : "landscape"),
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

                    try {
                        const quality = getQualityFromBPP(imgState.originalBPP, globalJpegQuality);
                        await uploadCanvasBlob(offCanvas, targetMime, quality, result.saveToken);
                        successCount++;
                    } catch (err: any) {
                        console.error("Save failed:", err);
                        failCount++;
                    }
                } catch (e) {
                    console.error("Unexpected error processing image", i, e);
                    failCount++;
                } finally {
                    if (offCanvas) {
                        offCanvas.width = 0;
                        offCanvas.height = 0;
                    }
                    if (imgToDraw && !importedImages[i].imageObj) {
                        imgToDraw.src = "";
                    }
                }
            }
            
            if (isMounted.current) {
                if (failCount > 0) {
                    showToast(`Export complete: ${successCount} succeeded, ${failCount} failed.`, true);
                } else {
                    showToast(`Successfully exported all ${successCount} images.`);
                }
            }
        } catch (err: any) {
            const errStr = err instanceof Error ? err.message : String(err);
            console.error("Failed to export all:", errStr);
            if (isMounted.current) showToast("Failed to export all: " + errStr, true);
        } finally {
            if (isMounted.current) setIsSelecting(false);
            isSelectingRef.current = false;
        }
    };

    return { downloadImage, downloadAllImages };
}
