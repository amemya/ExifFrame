import { RefObject, MutableRefObject } from 'react';
// @ts-expect-error generated bindings
import { App as AppAPI } from '../../bindings/ExifFrame/index';
import { ImportedImage, MetadataVisibility, DEFAULT_FONT_FAMILY } from '../types';
import { getExportInfo, getQualityFromBPP } from '../utils';
import { renderImageToCanvas } from '../canvas';

export interface UseExportProps {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    imageObj: HTMLImageElement | null;
    currentImage: ImportedImage;
    importedImages: ImportedImage[];
    isSelectingRef: MutableRefObject<boolean>;
    setIsSelecting: (v: boolean) => void;
    showToast: (msg: string, isError?: boolean) => void;
    
    profile: string;
    visibility: MetadataVisibility;
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
    profile, visibility, globalJpegQuality
}: UseExportProps) {
    
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
                showToast("Export complete!");
            } catch (err: any) {
                console.error("HTTP POST failed for", exportName, err);
                showToast("Save failed: " + (err instanceof Error ? err.message : String(err)), true);
            }
        } catch (err) {
            console.error("Failed to execute SaveImage:", err);
            showToast("Failed to save image", true);
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
            showToast("Exporting images...");

            for (let i = 0; i < importedImages.length; i++) {
                const imgState = importedImages[i];
                let imgToDraw: HTMLImageElement | null = null;
                let offCanvas: HTMLCanvasElement | null = null;
                try {
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
                        aspectRatioPreset: imgState.aspectRatioPreset || '1:1',
                        customRatioW: imgState.customRatioW || 0,
                        customRatioH: imgState.customRatioH || 0,
                        orientation: imgState.orientation || (imgToDraw.height > imgToDraw.width ? "portrait" : "landscape"),
                        alignment: imgState.alignment || 'center',
                        showPipeSeparator: imgState.showPipeSeparator || false,
                        profile,
                        visibility,
                        fontFamily: imgState.fontFamily || DEFAULT_FONT_FAMILY,
                        frameColor: imgState.frameColor || '#ffffff',
                        textColor: imgState.textColor || '#000000'
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
                    if (imgToDraw && !imgState.imageObj) {
                        imgToDraw.src = "";
                    }
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

    return { downloadImage, downloadAllImages };
}
