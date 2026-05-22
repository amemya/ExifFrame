import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { OpenImage, SaveImage, GetSettings, SaveSettings, SaveAutoImage, SelectWatchFolder, SelectExportFolder } from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import { WindowToggleMaximise, Environment, EventsOn, EventsOff } from '../wailsjs/runtime/runtime';

interface ExifData {
    camera: string;
    lens: string;
    focalLength: string;
    aperture: string;
    shutterSpeed: string;
    iso: string;
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

    // Camera and Lens
    const topElements = [exif.camera, exif.lens].filter(Boolean);
    const topText = topElements.join(" | ");

    if (topText) {
        const titleFontSize = Math.floor(baseScale * 0.035); // 画像サイズの約3.5%
        ctx.font = `normal ${titleFontSize}px "Gill Sans", sans-serif`;
        ctx.fillText(topText, canvas.width / 2, textY - (titleFontSize * 0.8));
    }

    // Settings (Aperture, SS, ISO etc)
    const bottomElements = [exif.focalLength, exif.aperture, exif.shutterSpeed, exif.iso].filter(Boolean);
    const bottomText = bottomElements.join(" | ");

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

function App() {
    const [showSettings, setShowSettings] = useState(false);
    const [watchFolder, setWatchFolder] = useState("");
    const [exportFolder, setExportFolder] = useState("");

    useEffect(() => {
        EventsOn("process_file", async (data: any) => {
            const { result, export: exportFolderStr } = data;
            if (!result || !result.imageURL) return;

            try {
                const currentSet = await GetSettings();

                const img = new Image();
                img.onload = async () => {
                    const offscreenCanvas = document.createElement('canvas');
                    const exifData = {
                        camera: result.camera || "",
                        lens: result.lens || "",
                        focalLength: result.focalLength || "",
                        aperture: result.aperture || "",
                        shutterSpeed: result.shutterSpeed || "",
                        iso: result.iso || ""
                    };
                    
                    renderImageToCanvas(offscreenCanvas, img, exifData, {
                        aspectRatioPreset: currentSet.aspectRatioPreset || "4300:3618",
                        customRatioW: currentSet.customRatioW || 4300,
                        customRatioH: currentSet.customRatioH || 3618,
                        orientation: (currentSet.orientation as any) || "landscape",
                        alignment: (currentSet.alignment as any) || "top"
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
                            const resultSave = await SaveAutoImage(isPng, savePath); 
                            if (resultSave.saveToken) {
                                const arrayBuffer = await blob.arrayBuffer();
                                await fetch(`/api/save?token=${encodeURIComponent(resultSave.saveToken)}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': targetMime },
                                    body: arrayBuffer,
                                });
                                console.log("Background save complete:", savePath);
                            } else {
                                console.error("Auto save failed:", resultSave.error);
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }, targetMime, 1.0);
                };
                img.src = result.imageURL;
            } catch (e) {
                console.error(e);
            }
        });

        return () => {
            EventsOff("process_file");
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
        iso: ""
    });

    const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const isSelectingRef = useRef(false);
    const [filePath, setFilePath] = useState("");
    const isInitialLoad = useRef(true);
    const isEventsRegistered = useRef(false);
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
        GetSettings().then(s => {
            if (s.watchFolder) setWatchFolder(s.watchFolder);
            if (s.exportFolder) setExportFolder(s.exportFolder);
            if (s.aspectRatioPreset) setAspectRatioPreset(s.aspectRatioPreset);
            if (s.customRatioW) setCustomRatioW(s.customRatioW);
            if (s.customRatioH) setCustomRatioH(s.customRatioH);
            if (s.orientation) setOrientation(s.orientation as any);
            if (s.alignment) setAlignment(s.alignment as any);

            // Allow short delay before enabling auto-save to prevent initial trigger
            setTimeout(() => {
                isInitialLoad.current = false;
            }, 100);
        });

        if (!isEventsRegistered.current) {
            EventsOn("open_settings", () => {
                console.log("open_settings event received");
                setShowSettings(true);
            });
            isEventsRegistered.current = true;
        }
        
        // Return cleanup
        return () => {
            // EventsOff not used due to React StrictMode mounting twice, relying on useRef
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
            const s = new main.Settings();
            s.watchFolder = watchFolder;
            s.exportFolder = exportFolder;
            s.aspectRatioPreset = aspectRatioPreset;
            s.customRatioW = customRatioW;
            s.customRatioH = customRatioH;
            s.orientation = orientation;
            s.alignment = alignment;
            try {
                const errStr = await SaveSettings(s);
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
    }, [aspectRatioPreset, customRatioW, customRatioH, orientation, alignment, watchFolder, exportFolder]);

    useEffect(() => {
        Environment().then(env => {
            if (env.platform === 'darwin') {
                setIsMac(true);
            }
        }).catch(err => {
            console.debug("Failed to get Environment:", err);
        });
    }, []);

    const handleSelectImage = async () => {
        if (isSelectingRef.current) return;
        isSelectingRef.current = true;
        setIsSelecting(true);
        try {
            const result = await OpenImage();

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
                    setExif({
                        camera: result.camera || "",
                        lens: result.lens || "",
                        focalLength: result.focalLength || "",
                        aperture: result.aperture || "",
                        shutterSpeed: result.shutterSpeed || "",
                        iso: result.iso || ""
                    });
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
            alignment
        });
    }, [exif, aspectRatioPreset, customRatioW, customRatioH, orientation, alignment]);

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
            const result = await SaveImage(isPng, exportName);

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
                WindowToggleMaximise();
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
                                        className={`segment ${orientation === 'landscape' ? 'active' : ''}`}
                                        onClick={() => setOrientation('landscape')}
                                        disabled={aspectRatioPreset === '1:1'}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect></svg>
                                        Landscape
                                    </button>
                                    <button 
                                        className={`segment ${orientation === 'portrait' ? 'active' : ''}`}
                                        onClick={() => setOrientation('portrait')}
                                        disabled={aspectRatioPreset === '1:1'}
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
                                        className={`segment ${alignment === 'top' ? 'active' : ''}`}
                                        onClick={() => setAlignment('top')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="4" x2="20" y2="4"></line><rect x="8" y="8" width="8" height="8" rx="1" ry="1"></rect></svg>
                                        Top
                                    </button>
                                    <button 
                                        className={`segment ${alignment === 'center' ? 'active' : ''}`}
                                        onClick={() => setAlignment('center')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><rect x="8" y="8" width="8" height="8" rx="1" ry="1"></rect></svg>
                                        Center
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="sidebar-section metadata-settings-section">
                            <h3>Metadata Settings</h3>
                            <div className="input-group">
                                <label htmlFor="camera-input">Camera</label>
                                <input id="camera-input" type="text" value={exif.camera} onChange={e => setExif({ ...exif, camera: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label htmlFor="lens-input">Lens</label>
                                <input id="lens-input" type="text" value={exif.lens} onChange={e => setExif({ ...exif, lens: e.target.value })} />
                            </div>
                            <div className="input-row">
                                <div className="input-group">
                                    <label htmlFor="focalLength-input">Focal Length</label>
                                    <input id="focalLength-input" type="text" value={exif.focalLength} onChange={e => setExif({ ...exif, focalLength: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label htmlFor="aperture-input">Aperture</label>
                                    <input id="aperture-input" type="text" value={exif.aperture} onChange={e => setExif({ ...exif, aperture: e.target.value })} />
                                </div>
                            </div>
                            <div className="input-row">
                                <div className="input-group">
                                    <label htmlFor="shutterSpeed-input">Shutter Speed</label>
                                    <input id="shutterSpeed-input" type="text" value={exif.shutterSpeed} onChange={e => setExif({ ...exif, shutterSpeed: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label htmlFor="iso-input">ISO</label>
                                    <input id="iso-input" type="text" value={exif.iso} onChange={e => setExif({ ...exif, iso: e.target.value })} />
                                </div>
                            </div>
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
                                    const path = await SelectWatchFolder();
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
                                    const path = await SelectExportFolder();
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
