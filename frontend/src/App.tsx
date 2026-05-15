import { useState, useRef, useEffect } from 'react';
import './App.css';
import { OpenImage, SaveImage } from '../wailsjs/go/main/App';
import { WindowToggleMaximise, Environment } from '../wailsjs/runtime/runtime';

interface ExifData {
    camera: string;
    lens: string;
    focalLength: string;
    aperture: string;
    shutterSpeed: string;
    iso: string;
}

const TOAST_DURATION_MS = 3000;

function App() {
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
    const [isMac, setIsMac] = useState(false);
    const [sourceMimeType, setSourceMimeType] = useState("");
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimerRef = useRef<number | null>(null);
    const toastRafRef = useRef<number | null>(null);

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
        return () => {
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
            }
            if (toastRafRef.current !== null) {
                window.cancelAnimationFrame(toastRafRef.current);
            }
        };
    }, []);

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

    useEffect(() => {
        if (!imageObj || !canvasRef.current) return;

        drawCanvas(imageObj);
    }, [imageObj, exif]);

    const drawCanvas = (img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // 好みの左右・上の枠の太さ（例：幅の3.5%）
        const framePadding = Math.floor(img.width * 0.025);

        // 全体の仕上がりを 4300 : 3618 の比率に強制する
        const targetRatio = 4300 / 3618;

        // 完成品の幅を先に決め、ターゲット比率から高さを逆算する
        // ⚠️ CRITICAL: Must be set BEFORE getContext, otherwise context properties (colorSpace) are reset!
        canvas.width = img.width + (framePadding * 2);
        canvas.height = Math.floor(canvas.width / targetRatio);

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

        // 完成品の高さから「下の余白（margin）」を逆算
        const margin = canvas.height - img.height - (framePadding * 2);

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw image
        ctx.drawImage(img, framePadding, framePadding);

        // 写真の下端からキャンバスの下端までの「目に見える下の白枠すべて」の高さ
        const bottomSpaceHeight = margin + framePadding;

        // 本当の視覚的な中央座標を計算
        const textY = img.height + framePadding + (bottomSpaceHeight / 2);

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
        ctx.moveTo(canvas.width * 0.2, img.height + framePadding);
        ctx.lineTo(canvas.width * 0.8, img.height + framePadding);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = Math.max(1, Math.floor(baseScale * 0.0015));
        ctx.stroke();
    };

    const downloadImage = async () => {
        if (!canvasRef.current || !imageObj) return;

        try {
            // Determine format from the actual MIME type detected by Go.
            // If the source was a PNG, maintain lossless export.
            const isPng = sourceMimeType === 'image/png';
            const targetMime = isPng ? 'image/png' : 'image/jpeg';

            // Step 1: Open native save dialog via IPC (no binary data transferred)
            const result = await SaveImage(isPng);

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

            // Step 3: Send binary directly to Go HTTP handler with save token
            const response = await fetch(`/api/save?token=${encodeURIComponent(result.saveToken)}`, {
                method: 'POST',
                headers: { 'Content-Type': targetMime },
                body: blob,
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
                        <div className="sidebar-section">
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
        </div>
    );
}

export default App;
