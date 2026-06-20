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
}
