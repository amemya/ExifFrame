import { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import './App.css';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI, Settings } from '../bindings/ExifFrame/index';
import { Window, Events, System } from '@wailsio/runtime';

interface ExifData {
    camera: string;
    lens: string;
    focalLength: string;
    aperture: string;
    shutterSpeed: string;
    iso: string;
    film: string;
    developer: string;
    dilution: string;
    temperature: string;
    time: string;
}

interface MetadataVisibility {
    camera: boolean;
    lens: boolean;
    focalLength: boolean;
    aperture: boolean;
    shutterSpeed: boolean;
    iso: boolean;
    film: boolean;
    developer: boolean;
    dilution: boolean;
    temperature: boolean;
    time: boolean;
}

const VISIBILITY_KEYS = [
    'camera','lens','focalLength','aperture','shutterSpeed','iso',
    'film','developer','dilution','temperature','time',
] as const;

const settingsKey = (k: typeof VISIBILITY_KEYS[number]) =>
    k === 'iso' ? 'visibilityISO' : `visibility${k.charAt(0).toUpperCase()}${k.slice(1)}`;

function toVisibility(s: any): MetadataVisibility {
    return Object.fromEntries(
        VISIBILITY_KEYS.map(k => [k, (s[settingsKey(k)] as boolean) ?? true])
    ) as unknown as MetadataVisibility;
}

function applyVisibility(s: any, v: MetadataVisibility): void {
    VISIBILITY_KEYS.forEach(k => { s[settingsKey(k)] = v[k]; });
}

const TOAST_DURATION_MS = 3000;

function renderImageToCanvas(
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    exif: ExifData,
    settings: {
        aspectRatioPreset: string;
        customRatioW: number;
        customRatioH: number;
        orientation: "landscape" | "portrait";
        alignment: "top" | "center";
        showPipeSeparator: boolean;
        profile: string;
        visibility: MetadataVisibility;
    }
) {
    // 好みの左右・上の枠の最小太さ（例：幅の2.5%）
    const minFramePadding = Math.floor(img.width * 0.025);
    // 下部のテキスト領域に必要な最小スペース
    const minBottomSpace = Math.floor(minFramePadding * 4.5);

    let targetRatio = 4300 / 3618;
    if (settings.aspectRatioPreset === "custom") {
        if (settings.customRatioW > 0 && settings.customRatioH > 0) {
            targetRatio = settings.customRatioW / settings.customRatioH;
        } else {
            targetRatio = img.width / img.height;
        }
    } else {
        const [w, h] = settings.aspectRatioPreset.split(':').map(Number);
        if (w && h) targetRatio = w / h;
    }

    // Apply orientation flip
    if (settings.orientation === "portrait" && targetRatio > 1) {
        targetRatio = 1 / targetRatio;
    } else if (settings.orientation === "landscape" && targetRatio < 1) {
        targetRatio = 1 / targetRatio;
    }

    const minCanvasWidth = img.width + (minFramePadding * 2);
    const minCanvasHeight = img.height + minFramePadding + minBottomSpace;

    // まず幅を基準に高さを計算
    let finalCanvasWidth = minCanvasWidth;
    let finalCanvasHeight = Math.floor(finalCanvasWidth / targetRatio);

    if (finalCanvasHeight < minCanvasHeight) {
        // 高さが足りない場合は、最小の高さを基準にして幅を拡張
        finalCanvasHeight = minCanvasHeight;
        finalCanvasWidth = Math.floor(finalCanvasHeight * targetRatio);
    }

    // ⚠️ CRITICAL: Must be set BEFORE getContext, otherwise context properties (colorSpace) are reset!
    canvas.width = finalCanvasWidth;
    canvas.height = finalCanvasHeight;

    // 余分な高さを計算
    const extraHeight = finalCanvasHeight - minCanvasHeight;

    // 画像の配置位置を計算 (左右中央、上固定または上下中央)
    const drawX = Math.floor((finalCanvasWidth - img.width) / 2);
    const drawY = settings.alignment === "center" ? minFramePadding + Math.floor(extraHeight / 2) : minFramePadding;

    // Enable P3 wide-gamut mode to prevent high-saturation color loss, with a fallback
    let ctx: CanvasRenderingContext2D | null = null;
    try {
        ctx = canvas.getContext('2d', { colorSpace: 'display-p3' } as CanvasRenderingContext2DSettings);
    } catch (e) {
        // Context with colorSpace might throw in unsupported environments
    }
    if (!ctx) {
        ctx = canvas.getContext('2d');
    }
    if (!ctx) return;

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(img, drawX, drawY);

    // 画像の下端座標
    const imgBottomY = drawY + img.height;
    // 写真の下端からキャンバスの下端までの余白
    const bottomSpaceHeight = canvas.height - imgBottomY;

    // テキストの配置Y座標は、画像の下端とキャンバス下端の中央
    const textY = imgBottomY + (bottomSpaceHeight / 2);

    // テキストのサイズを（marginではなく）画像自体のサイズを基準にする
    const baseScale = Math.min(img.width, img.height);

    // Settings for text
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const separator = settings.showPipeSeparator ? " | " : "   ";

    // Camera and Lens
    const topElements: string[] = [];
    if (settings.visibility.camera && exif.camera) topElements.push(exif.camera);
    if (settings.visibility.lens && exif.lens) topElements.push(exif.lens);
    const topText = topElements.join(separator);

    if (topText) {
        const titleFontSize = Math.floor(baseScale * 0.035); // 画像サイズの約3.5%
        ctx.font = `normal ${titleFontSize}px "Gill Sans", sans-serif`;
        ctx.fillText(topText, canvas.width / 2, textY - (titleFontSize * 0.8));
    }

    const bottomElements: string[] = [];
    if (settings.visibility.focalLength && exif.focalLength) bottomElements.push(exif.focalLength);
    if (settings.visibility.aperture && exif.aperture) bottomElements.push(exif.aperture);
    if (settings.visibility.shutterSpeed && exif.shutterSpeed) bottomElements.push(exif.shutterSpeed);

    if (settings.profile === "film") {
        if (settings.visibility.film && exif.film) bottomElements.push(exif.film);
        if (settings.visibility.developer && exif.developer) bottomElements.push(exif.developer);
        if (settings.visibility.dilution && exif.dilution) bottomElements.push(exif.dilution);
        if (settings.visibility.temperature && exif.temperature) bottomElements.push(exif.temperature);
        if (settings.visibility.time && exif.time) bottomElements.push(exif.time);
    } else {
        if (settings.visibility.iso && exif.iso) bottomElements.push(exif.iso);
    }
    const bottomText = bottomElements.join(separator);

    if (bottomText) {
        const descFontSize = Math.floor(baseScale * 0.025); // 画像サイズの約2.5%
        ctx.font = `normal ${descFontSize}px "Gill Sans", sans-serif`;
        ctx.fillStyle = '#555555';
        ctx.fillText(bottomText, canvas.width / 2, textY + (descFontSize * 0.8));
    }

    // Draw a subtle line separator (just above the text)
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.2, imgBottomY);
    ctx.lineTo(canvas.width * 0.8, imgBottomY);
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = Math.max(1, Math.floor(baseScale * 0.0015));
    ctx.stroke();
}

const EyeIcon = ({ visible }: { visible: boolean }) => (
    visible ? (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    ) : (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
    )
);

interface ToggleInputProps {
    label: string;
    id: string;
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    visible: boolean;
    onToggleVisibility: () => void;
}

const ToggleInput = ({ label, id, value, onChange, visible, onToggleVisibility }: ToggleInputProps) => (
    <div className="input-group">
        <div className="toggle-input-header">
            <label htmlFor={id} className="toggle-input-label">{label}</label>
            <button 
                type="button" 
                onClick={onToggleVisibility} 
                className={`toggle-visibility-btn ${visible ? 'visible' : ''}`}
                title={visible ? `Hide ${label} from frame` : `Show ${label} on frame`}
                aria-label={visible ? `Hide ${label} from frame` : `Show ${label} on frame`}
                aria-pressed={visible}
            >
                <EyeIcon visible={visible} />
            </button>
        </div>
        <input 
            id={id} 
            type="text" 
            value={value} 
            onChange={onChange} 
            className={`toggle-input-field ${!visible ? 'hidden' : ''}`} 
        />
    </div>
);

interface ProcessFileResult {
    imageURL: string;
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutterSpeed?: string;
    iso?: string;
    mimeType?: string;
    filePath?: string;
}

interface ProcessFileData {
    result: ProcessFileResult;
    export: string;
}

interface WailsProcessFileEvent {
    data: ProcessFileData[] | ProcessFileData;
}

function App() {
    const [showSettings, setShowSettings] = useState(false);
    const [watchFolder, setWatchFolder] = useState("");
    const [exportFolder, setExportFolder] = useState("");

    const [profile, setProfile] = useState<string>("digital");
    
    useEffect(() => {
        const unsubProcess = Events.On("process_file", (event: WailsProcessFileEvent) => {
            if (!event?.data) return;
            // Handle Wails v2 vs v3 payload differences:
            // - Wails v2 wraps arguments in an array: [{ result, export }]
            // - Wails v3 passes single arguments directly: { result, export }
            const data = Array.isArray(event.data) ? event.data[0] : event.data;
            if (!data || !data.result) return;
            const { result, export: exportFolderStr } = data;
            if (!result || !result.imageURL) return;

                AppAPI.GetSettings().then(async (currentSet: Settings) => {
                    const img = new Image();
                img.onload = async () => {
                    const offscreenCanvas = document.createElement('canvas');
                    const exifData = {
                        camera: result.camera || "",
                        lens: result.lens || "",
                        focalLength: result.focalLength || "",
                        aperture: result.aperture || "",
                        shutterSpeed: result.shutterSpeed || "",
                        iso: result.iso || "",
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
                        visibility: toVisibility(currentSet)
                    });

                    const isPng = result.mimeType === 'image/png';
                    const targetMime = isPng ? 'image/png' : 'image/jpeg';
                    const filenameMatch = result.filePath ? result.filePath.split(/[/\\]/).pop() : "";
                    const baseName = (filenameMatch ? filenameMatch.replace(/\.[^/.]+$/, "") : "") || "exif-frame";
                    let exportName = `${baseName}_ExifFrame`;
                    if (isPng) exportName += ".png"; else exportName += ".jpg";

                    const savePath = exportFolderStr + "/" + exportName;

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
                    }, targetMime, 1.0);
                };
                img.onerror = () => {
                    console.error("Background image load failed:", result.imageURL);
                };
                img.src = result.imageURL;
            }).catch((e: any) => console.error(e));
        });

        return () => {
            unsubProcess();
        };
    }, []);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [exif, setExif] = useState<ExifData>({
        camera: "",
        lens: "",
        focalLength: "",
        aperture: "",
        shutterSpeed: "",
        iso: "",
        film: "",
        developer: "",
        dilution: "",
        temperature: "",
        time: ""
    });

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

    const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const isSelectingRef = useRef(false);
    const [filePath, setFilePath] = useState("");
    const isInitialLoad = useRef(true);
    const [isMac, setIsMac] = useState(false);
    const [sourceMimeType, setSourceMimeType] = useState("");
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimerRef = useRef<number | null>(null);
    const toastRafRef = useRef<number | null>(null);

    // Toast cleanup
    useEffect(() => {
        return () => {
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
            }
            if (toastRafRef.current !== null) {
                window.cancelAnimationFrame(toastRafRef.current);
            }
        };
    }, []);

    const [aspectRatioPreset, setAspectRatioPreset] = useState<string>("4300:3618");
    const [customRatioW, setCustomRatioW] = useState<number>(4300);
    const [customRatioH, setCustomRatioH] = useState<number>(3618);
    const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
    const [alignment, setAlignment] = useState<"top" | "center">("top");
    const [showPipeSeparator, setShowPipeSeparator] = useState<boolean>(true);

    const showToast = (message: string) => {
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
        }
        if (toastRafRef.current !== null) {
            window.cancelAnimationFrame(toastRafRef.current);
            toastRafRef.current = null;
        }
        
        // Force a re-render by clearing the state first
        setToastMessage(null);
        toastRafRef.current = requestAnimationFrame(() => {
            setToastMessage(message);
            toastTimerRef.current = window.setTimeout(() => {
                setToastMessage(null);
                toastTimerRef.current = null;
            }, TOAST_DURATION_MS);
            toastRafRef.current = null;
        });
    };

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

        const unsubSettings = Events.On("open_settings", () => {
            console.log("open_settings event received");
            setShowSettings(true);
        });
        
        return () => {
            unsubSettings();
        };
    }, []);

    // Escape key to close settings modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowSettings(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Save settings when aspect ratio etc changes
    useEffect(() => {
        if (isInitialLoad.current) return;
        
        const saveCurrentSettings = async () => {
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
            s.film = exif.film;
            s.developer = exif.developer;
            s.dilution = exif.dilution;
            s.temperature = exif.temperature;
            s.time = exif.time;
            
            applyVisibility(s, visibility);

            try {
                const errStr = await AppAPI.SaveSettings(s);
                if (errStr && errStr !== "") {
                    showToast(errStr);
                } else {
                    showToast("Settings saved");
                }
            } catch (e: any) {
                showToast("Error saving settings");
            }
        };

        // Debounce saving settings when UI changes
        const t = setTimeout(() => {
            saveCurrentSettings();
        }, 500);
        return () => clearTimeout(t);
    }, [aspectRatioPreset, customRatioW, customRatioH, orientation, alignment, showPipeSeparator, watchFolder, exportFolder, profile, exif.film, exif.developer, exif.dilution, exif.temperature, exif.time, visibility.camera, visibility.lens, visibility.focalLength, visibility.aperture, visibility.shutterSpeed, visibility.iso, visibility.film, visibility.developer, visibility.dilution, visibility.temperature, visibility.time]);

    useEffect(() => {
        setIsMac(System.IsMac());
    }, []);

    const handleSelectImage = async () => {
        if (isSelectingRef.current) return;
        isSelectingRef.current = true;
        setIsSelecting(true);
        try {
            const result = await AppAPI.OpenImage();

            if (result.cancelled) {
                return;
            }

            if (result.error) {
                console.error(result.error);
                return;
            }

            if (!result.imageURL) {
                console.error("Server returned an empty image URL");
                return;
            }

            // Load the image via HTTP URL (served by AssetServer Middleware)
            await new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    // Update EXIF state (leave empty if not found)
                    setExif(prev => ({
                        ...prev,
                        camera: result.camera || "",
                        lens: result.lens || "",
                        focalLength: result.focalLength || "",
                        aperture: result.aperture || "",
                        shutterSpeed: result.shutterSpeed || "",
                        iso: result.iso || ""
                    }));
                    setFilePath(result.filePath || "");
                    setSourceMimeType(result.mimeType || "");

                    setImageObj(img);
                    setOrientation(img.height > img.width ? "portrait" : "landscape");
                    setImageLoaded(true);
                    resolve();
                };
                img.onerror = () => {
                    console.error("Failed to decode or render the selected image");
                    reject(new Error("Failed to decode image"));
                };
                img.src = result.imageURL;
            });

        } catch (err) {
            console.error("Failed to open image:", err);
        } finally {
            isSelectingRef.current = false;
            setIsSelecting(false);
        }
    };

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
            visibility
        });
    }, [exif, aspectRatioPreset, customRatioW, customRatioH, orientation, alignment, showPipeSeparator, profile, visibility]);

    useEffect(() => {
        if (!imageObj || !canvasRef.current) return;

        drawCanvas(imageObj);
    }, [imageObj, drawCanvas]);

    const downloadImage = async () => {
        if (!canvasRef.current || !imageObj) return;

        try {
            // Determine format from the actual MIME type detected by Go.
            // If the source was a PNG, maintain lossless export.
            const isPng = sourceMimeType === 'image/png';
            const targetMime = isPng ? 'image/png' : 'image/jpeg';

            // Determine export filename from original path
            const filenameMatch = filePath ? filePath.split(/[/\\]/).pop() : "";
            const baseName = (filenameMatch ? filenameMatch.replace(/\.[^/.]+$/, "") : "") || "exif-frame";
            const exportName = `${baseName}_ExifFrame`;

            // Step 1: Open native save dialog via IPC (no binary data transferred)
            const result = await AppAPI.SaveImage(isPng, exportName);

            if (result.cancelled) {
                return;
            }
            if (result.error) {
                console.error("Export failed:", result.error);
                alert("Failed to save image: " + result.error);
                return;
            }

            // Step 2: Convert canvas to binary Blob (no Base64 intermediate)
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvasRef.current!.toBlob(
                    (b) => b ? resolve(b) : reject(new Error("toBlob returned null")),
                    targetMime,
                    1.0 // For JPEG: highest quality. PNG ignores this.
                );
            });

            // Step 3: Send binary directly to Go HTTP handler with save token.
            // WARNING: On macOS WebKit, using a Blob body with a custom URL scheme (wails://) 
            // often results in an empty payload (0kb file). We MUST convert it to an ArrayBuffer first.
            const arrayBuffer = await blob.arrayBuffer();
            const response = await fetch(`/api/save?token=${encodeURIComponent(result.saveToken)}`, {
                method: 'POST',
                headers: { 'Content-Type': targetMime },
                body: arrayBuffer,
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("Save failed:", errText);
                alert("Failed to save image: " + errText);
            } else {
                showToast("Image saved successfully");
            }
        } catch (err) {
            console.error("Failed to execute SaveImage:", err);
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
                    {filePath && <span className="file-path">{filePath.split(/[/\\]/).filter(Boolean).join(' > ')}</span>}
                </div>
                <div className="top-bar-actions">
                    <button className="btn btn-secondary" onClick={handleSelectImage} disabled={isSelecting}>
                        {imageLoaded ? 'Change Photo' : 'Open Photo'}
                    </button>
                    {imageLoaded && (
                        <button className="btn btn-primary" onClick={downloadImage} disabled={isSelecting}>
                            Export
                        </button>
                    )}
                </div>
            </header>

            <main className="workspace">
                <div className="preview-area">
                    {!imageLoaded ? (
                        <div
                            className={`empty-state ${isSelecting ? 'selecting' : ''}`}
                            onClick={isSelecting ? undefined : handleSelectImage}
                            role="button"
                            tabIndex={isSelecting ? -1 : 0}
                            aria-label={isSelecting ? "Opening photo..." : "Click or press Enter to open a photo"}
                            aria-busy={isSelecting}
                            aria-disabled={isSelecting}
                            onKeyDown={(e) => {
                                if (isSelecting) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault(); // Prevent page scroll for Space
                                    handleSelectImage();
                                }
                            }}
                        >
                            {isSelecting ? (
                                <>
                                    <svg className="spinner" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }} aria-hidden="true">
                                        <line x1="12" y1="2" x2="12" y2="6"></line>
                                        <line x1="12" y1="18" x2="12" y2="22"></line>
                                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                                        <line x1="2" y1="12" x2="6" y2="12"></line>
                                        <line x1="18" y1="12" x2="22" y2="12"></line>
                                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                                        <line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line>
                                    </svg>
                                    <p>Opening photo...</p>
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }} aria-hidden="true">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                        <polyline points="21 15 16 10 5 21"></polyline>
                                    </svg>
                                    <p>Click to open a photo</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="canvas-wrapper">
                            <canvas ref={canvasRef} className="preview-canvas" />
                        </div>
                    )}
                </div>

                {imageLoaded && (
                    <aside className="sidebar">
                        <div className="sidebar-section frame-settings-section">
                            <h3>Frame Settings</h3>
                            <div className="input-group">
                                <label htmlFor="aspect-ratio-preset">Aspect Ratio</label>
                                <select 
                                    id="aspect-ratio-preset" 
                                    value={aspectRatioPreset} 
                                    onChange={(e) => setAspectRatioPreset(e.target.value)}
                                >
                                    <option value="4300:3618">Default (4300:3618)</option>
                                    <option value="1:1">Square (1:1)</option>
                                    <option value="3:2">3:2</option>
                                    <option value="4:3">4:3</option>
                                    <option value="16:9">16:9</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>
                            {aspectRatioPreset === "custom" && (
                                <div className="input-row">
                                    <div className="input-group">
                                        <label htmlFor="custom-ratio-w">Width</label>
                                        <input 
                                            id="custom-ratio-w" 
                                            type="number" 
                                            value={customRatioW || ''} 
                                            onChange={e => setCustomRatioW(Number(e.target.value) || 0)} 
                                            min="1"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label htmlFor="custom-ratio-h">Height</label>
                                        <input 
                                            id="custom-ratio-h" 
                                            type="number" 
                                            value={customRatioH || ''} 
                                            onChange={e => setCustomRatioH(Number(e.target.value) || 0)} 
                                            min="1"
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="input-group">
                                <label>Orientation</label>
                                <div className={`segmented-control ${aspectRatioPreset === '1:1' ? 'disabled' : ''}`}>
                                    <button 
                                        type="button"
                                        className={`segment ${orientation === 'landscape' ? 'active' : ''}`}
                                        onClick={() => setOrientation('landscape')}
                                        disabled={aspectRatioPreset === '1:1'}
                                        aria-pressed={orientation === 'landscape'}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect></svg>
                                        Landscape
                                    </button>
                                    <button 
                                        type="button"
                                        className={`segment ${orientation === 'portrait' ? 'active' : ''}`}
                                        onClick={() => setOrientation('portrait')}
                                        disabled={aspectRatioPreset === '1:1'}
                                        aria-pressed={orientation === 'portrait'}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2" ry="2"></rect></svg>
                                        Portrait
                                    </button>
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Vertical Alignment</label>
                                <div className="segmented-control">
                                    <button 
                                        type="button"
                                        className={`segment ${alignment === 'top' ? 'active' : ''}`}
                                        onClick={() => setAlignment('top')}
                                        aria-pressed={alignment === 'top'}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="4" x2="20" y2="4"></line><rect x="8" y="8" width="8" height="8" rx="1" ry="1"></rect></svg>
                                        Top
                                    </button>
                                    <button 
                                        type="button"
                                        className={`segment ${alignment === 'center' ? 'active' : ''}`}
                                        onClick={() => setAlignment('center')}
                                        aria-pressed={alignment === 'center'}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><rect x="8" y="8" width="8" height="8" rx="1" ry="1"></rect></svg>
                                        Center
                                    </button>
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Separator Style</label>
                                <div className="segmented-control">
                                    <button 
                                        type="button"
                                        className={`segment ${showPipeSeparator ? 'active' : ''}`}
                                        onClick={() => setShowPipeSeparator(true)}
                                        aria-pressed={showPipeSeparator}
                                    >
                                        Pipe (|)
                                    </button>
                                    <button 
                                        type="button"
                                        className={`segment ${!showPipeSeparator ? 'active' : ''}`}
                                        onClick={() => setShowPipeSeparator(false)}
                                        aria-pressed={!showPipeSeparator}
                                    >
                                        Space
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="sidebar-section metadata-settings-section">
                            <div className="metadata-settings-header">
                                <h3>Metadata Settings</h3>
                                <div className="segmented-control">
                                    <button 
                                        type="button"
                                        className={`segment ${profile === 'digital' ? 'active' : ''}`}
                                        onClick={() => setProfile('digital')}
                                        aria-pressed={profile === 'digital'}
                                    >
                                        Digital
                                    </button>
                                    <button 
                                        type="button"
                                        className={`segment ${profile === 'film' ? 'active' : ''}`}
                                        onClick={() => setProfile('film')}
                                        aria-pressed={profile === 'film'}
                                    >
                                        Film
                                    </button>
                                </div>
                            </div>
                            
                            <ToggleInput 
                                label="Camera" 
                                id="camera-input" 
                                value={exif.camera} 
                                onChange={(e) => setExif(prev => ({ ...prev, camera: e.target.value }))} 
                                visible={visibility.camera}
                                onToggleVisibility={() => setVisibility(prev => ({ ...prev, camera: !prev.camera }))}
                            />
                            <ToggleInput 
                                label="Lens" 
                                id="lens-input" 
                                value={exif.lens} 
                                onChange={(e) => setExif(prev => ({ ...prev, lens: e.target.value }))} 
                                visible={visibility.lens}
                                onToggleVisibility={() => setVisibility(prev => ({ ...prev, lens: !prev.lens }))}
                            />
                            
                            <div className="input-row">
                                <ToggleInput 
                                    label="Focal Length" 
                                    id="focalLength-input" 
                                    value={exif.focalLength} 
                                    onChange={(e) => setExif(prev => ({ ...prev, focalLength: e.target.value }))} 
                                    visible={visibility.focalLength}
                                    onToggleVisibility={() => setVisibility(prev => ({ ...prev, focalLength: !prev.focalLength }))}
                                />
                                <ToggleInput 
                                    label="Aperture" 
                                    id="aperture-input" 
                                    value={exif.aperture} 
                                    onChange={(e) => setExif(prev => ({ ...prev, aperture: e.target.value }))} 
                                    visible={visibility.aperture}
                                    onToggleVisibility={() => setVisibility(prev => ({ ...prev, aperture: !prev.aperture }))}
                                />
                            </div>
                            
                            <div className="input-row">
                                <ToggleInput 
                                    label="Shutter Speed" 
                                    id="shutterSpeed-input" 
                                    value={exif.shutterSpeed} 
                                    onChange={(e) => setExif(prev => ({ ...prev, shutterSpeed: e.target.value }))} 
                                    visible={visibility.shutterSpeed}
                                    onToggleVisibility={() => setVisibility(prev => ({ ...prev, shutterSpeed: !prev.shutterSpeed }))}
                                />
                                {profile === 'digital' ? (
                                    <ToggleInput 
                                        label="ISO" 
                                        id="iso-input" 
                                        value={exif.iso} 
                                        onChange={(e) => setExif(prev => ({ ...prev, iso: e.target.value }))} 
                                        visible={visibility.iso}
                                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, iso: !prev.iso }))}
                                    />
                                ) : (
                                    <ToggleInput 
                                        label="Film" 
                                        id="film-input" 
                                        value={exif.film} 
                                        onChange={(e) => setExif(prev => ({ ...prev, film: e.target.value }))} 
                                        visible={visibility.film}
                                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, film: !prev.film }))}
                                    />
                                )}
                            </div>
                            
                            {profile === 'film' && (
                                <>
                                    <div className="input-row">
                                        <ToggleInput 
                                            label="Developer" 
                                            id="developer-input" 
                                            value={exif.developer} 
                                            onChange={(e) => setExif(prev => ({ ...prev, developer: e.target.value }))} 
                                            visible={visibility.developer}
                                            onToggleVisibility={() => setVisibility(prev => ({ ...prev, developer: !prev.developer }))}
                                        />
                                        <ToggleInput 
                                            label="Dilution" 
                                            id="dilution-input" 
                                            value={exif.dilution} 
                                            onChange={(e) => setExif(prev => ({ ...prev, dilution: e.target.value }))} 
                                            visible={visibility.dilution}
                                            onToggleVisibility={() => setVisibility(prev => ({ ...prev, dilution: !prev.dilution }))}
                                        />
                                    </div>
                                    <div className="input-row">
                                        <ToggleInput 
                                            label="Temperature" 
                                            id="temperature-input" 
                                            value={exif.temperature} 
                                            onChange={(e) => setExif(prev => ({ ...prev, temperature: e.target.value }))} 
                                            visible={visibility.temperature}
                                            onToggleVisibility={() => setVisibility(prev => ({ ...prev, temperature: !prev.temperature }))}
                                        />
                                        <ToggleInput 
                                            label="Time" 
                                            id="time-input" 
                                            value={exif.time} 
                                            onChange={(e) => setExif(prev => ({ ...prev, time: e.target.value }))} 
                                            visible={visibility.time}
                                            onToggleVisibility={() => setVisibility(prev => ({ ...prev, time: !prev.time }))}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </aside>
                )}

                {toastMessage && (
                    <div className="toast-container" aria-live="polite" aria-atomic="true" role="status">
                        <div className="toast success" style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}>{toastMessage}</div>
                    </div>
                )}
            </main>

            {showSettings && (
                <div className="modal-overlay" onClick={() => setShowSettings(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Preferences</h2>
                        <div className="input-group">
                            <label>Watch Folder (Auto-process)</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input 
                                    type="text" 
                                    value={watchFolder} 
                                    readOnly 
                                    placeholder="/path/to/watch/folder"
                                    style={{ flex: 1 }}
                                />
                                <button onClick={async () => {
                                    const path = await AppAPI.SelectWatchFolder();
                                    if (path) setWatchFolder(path);
                                }} className="btn btn-secondary">Select</button>
                                <button onClick={() => setWatchFolder("")} className="btn btn-secondary" title="Clear Folder">✕</button>
                            </div>
                            <small>Images dropped here will be processed automatically.</small>
                        </div>
                        <div className="input-group">
                            <label>Export Folder (Auto-save)</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input 
                                    type="text" 
                                    value={exportFolder} 
                                    readOnly 
                                    placeholder="/path/to/export/folder"
                                    style={{ flex: 1 }}
                                />
                                <button onClick={async () => {
                                    const path = await AppAPI.SelectExportFolder();
                                    if (path) setExportFolder(path);
                                }} className="btn btn-secondary">Select</button>
                                <button onClick={() => setExportFolder("")} className="btn btn-secondary" title="Clear Folder">✕</button>
                            </div>
                            <small>Auto-processed images will be saved here.</small>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary" onClick={() => setShowSettings(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
