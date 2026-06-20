import { RefObject, MutableRefObject } from 'react';
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

export function useExport({
    canvasRef, imageObj, currentImage, importedImages,
    isSelectingRef, setIsSelecting, showToast,
    aspectRatioPreset, customRatioW, customRatioH, orientation,
    alignment, showPipeSeparator, profile, visibility,
    globalFrameColor, globalTextColor, globalJpegQuality
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
        if (isSelectingRef.current) return;
        
        isSelectingRef.current = true;
        let successCount = 0;
        let failCount = 0;

        try {
            const exportDir = await AppAPI.SelectExportFolder();
            if (!exportDir) {
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

    return { downloadImage, downloadAllImages };
}
