import { useEffect } from 'react';
import { Events } from '@wailsio/runtime';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI, Settings } from '../../bindings/ExifFrame/index';
import { toVisibility } from '../types';
import { getExportInfo, getQualityFromBPP } from '../utils';
import { renderImageToCanvas } from '../canvas';

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

export function useBackgroundProcessor() {
    useEffect(() => {
        let isMounted = true;
        const pendingImages = new Set<HTMLImageElement>();
        const unsubProcess = Events.On("process_file", (event: WailsProcessFileEvent) => {
            if (!event?.data) return;
            // Handle both Wails v2 (array) and Wails v3 (single object) format:
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
                if (!isMounted) return;
                const img = new Image();
                pendingImages.add(img);
                img.onload = async () => {
                    pendingImages.delete(img);
                    if (!isMounted) return;
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

                    try {
                        renderImageToCanvas(offscreenCanvas, img, exifData, {
                            aspectRatioPreset: currentSet.aspectRatioPreset || "4300:3618",
                            customRatioW: currentSet.customRatioW || 4300,
                            customRatioH: currentSet.customRatioH || 3618,
                            orientation: (currentSet.orientation as "landscape" | "portrait") || "landscape",
                            alignment: (currentSet.alignment as "top" | "center") || "top",
                            showPipeSeparator: currentSet.showPipeSeparator ?? true,
                            profile: currentSet.profile || "digital",
                            visibility: toVisibility(currentSet),
                            frameColor: currentSet.frameColor || "#ffffff",
                            textColor: currentSet.textColor || "#000000"
                        });
                    } catch (e) {
                        console.error("Failed to render background canvas:", e);
                        return;
                    }

                    const { isPng, targetMime, exportName } = getExportInfo(result.filePath || "", result.mimeType || "");

                    const savePath = exportFolderStr + "/" + exportName;

                    const quality = getQualityFromBPP(result.originalBPP, currentSet.jpegQuality || "auto");
                    offscreenCanvas.toBlob(async (blob) => {
                        offscreenCanvas.width = 0;
                        offscreenCanvas.height = 0;
                        if (!isMounted) return;
                        if (!blob) return;
                        try {
                            const resultSave = await AppAPI.SaveAutoImage(isPng, savePath);
                            if (!isMounted) return;

                            if (resultSave.error) {
                                console.error(`Auto save failed for ${savePath}:`, resultSave.error);
                                return;
                            }

                            if (resultSave.saveToken) {
                                const arrayBuffer = await blob.arrayBuffer();
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 15000);
                                const resp = await fetch(`/api/save?token=${encodeURIComponent(resultSave.saveToken)}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': targetMime },
                                    body: arrayBuffer,
                                    signal: controller.signal
                                });
                                clearTimeout(timeoutId);
                                if (!resp.ok) {
                                    const errText = await resp.text();
                                    console.error("Background save HTTP failed:", resp.status, errText);
                                } else {
                                    console.log("Background save complete:", savePath);
                                }
                            } else {
                                console.error(`Auto save failed for ${savePath}: No saveToken returned`);
                            }
                        } catch (e: any) {
                            if (e.name === 'AbortError') {
                                console.error(`Timeout during auto save for ${savePath}`);
                            } else {
                                const errMsg = e instanceof Error ? e.message : String(e);
                                console.error(`Unexpected error during auto save for ${savePath}:`, errMsg);
                            }
                        }
                    }, targetMime, quality);
                };
                img.onerror = () => {
                    pendingImages.delete(img);
                    console.error("Background image load failed:", imageUrl);
                };
                img.src = imageUrl;
            }).catch((e: any) => console.error(e));
        });

        return () => {
            isMounted = false;
            unsubProcess();
            pendingImages.forEach(img => {
                img.onload = null;
                img.onerror = null;
                img.src = "";
            });
            pendingImages.clear();
        };
    }, []);
}
