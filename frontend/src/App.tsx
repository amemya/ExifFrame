import { useState, useRef, useEffect } from 'react';
import './App.css';
import { OpenImage, SaveImage } from '../wailsjs/go/main/App';

interface ExifData {
    camera: string;
    lens: string;
    focalLength: string;
    aperture: string;
    shutterSpeed: string;
    iso: string;
}

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

    const handleSelectImage = async () => {
        try {
            const result = await OpenImage();

            if (result.cancelled) {
                return;
            }

            if (result.error) {
                console.error(result.error);
                return;
            }

            // Update EXIF state (leave empty if not found)
            setExif({
                camera: result.camera || "",
                lens: result.lens || "",
                focalLength: result.focalLength || "",
                aperture: result.aperture || "",
                shutterSpeed: result.shutterSpeed || "",
                iso: result.iso || ""
            });

            // Load the Base64 image
            const img = new Image();
            img.onload = () => {
                setImageObj(img);
                setImageLoaded(true);
            };
            img.onerror = () => {
                console.error("Failed to decode or render the selected image");
                setImageObj(null);
                setImageLoaded(false);
            };
            img.src = result.imageBase64;

        } catch (err) {
            console.error("Failed to open image:", err);
        }
    };

    useEffect(() => {
        if (!imageObj || !canvasRef.current) return;

        drawCanvas(imageObj);
    }, [imageObj, exif]);

    const drawCanvas = (img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
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

        // 好みの左右・上の枠の太さ（例：幅の3.5%）
        const framePadding = Math.floor(img.width * 0.025);

        // 全体の仕上がりを 4300 : 3618 の比率に強制する
        const targetRatio = 4300 / 3618;

        // 完成品の幅を先に決め、ターゲット比率から高さを逆算する
        canvas.width = img.width + (framePadding * 2);
        canvas.height = Math.floor(canvas.width / targetRatio);

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
            // Check original type to maintain lossless PNG if possible
            const isPng = imageObj.src.startsWith('data:image/png');
            const targetMime = isPng ? 'image/png' : 'image/jpeg';

            // For JPEG, 1.0 requests the highest quality setting, though JPEG remains lossy.
            // PNG ignores the quality parameter.
            const dataUrl = canvasRef.current.toDataURL(targetMime, 1.0);

            const result = await SaveImage(dataUrl);

            if (result.cancelled) {
                return;
            }
            if (result.error) {
                console.error("Export failed:", result.error);
                alert("Failed to save image: " + result.error);
            }
        } catch (err) {
            console.error("Failed to execute SaveImage:", err);
        }
    };

    return (
        <div className="app-container">
            <header className="header">
                <h1>ExifFrame</h1>
                <p>Add beautiful elegant metadata frames to your photos.</p>
            </header>

            <main className="main-content">
                <div className="upload-section">
                    <button className="upload-btn" onClick={handleSelectImage}>
                        Select Photo
                    </button>
                </div>

                <div className={`canvas-container ${imageLoaded ? 'visible' : ''}`}>
                    <canvas ref={canvasRef} className="preview-canvas" />
                </div>

                {imageLoaded && (
                    <div className="settings-panel">
                        <div className="input-group">
                            <label>Camera</label>
                            <input type="text" value={exif.camera} onChange={e => setExif({ ...exif, camera: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label>Lens</label>
                            <input type="text" value={exif.lens} onChange={e => setExif({ ...exif, lens: e.target.value })} />
                        </div>
                        <div className="input-row">
                            <div className="input-group">
                                <label>Focal Length</label>
                                <input type="text" value={exif.focalLength} onChange={e => setExif({ ...exif, focalLength: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Aperture</label>
                                <input type="text" value={exif.aperture} onChange={e => setExif({ ...exif, aperture: e.target.value })} />
                            </div>
                        </div>
                        <div className="input-row">
                            <div className="input-group">
                                <label>Shutter Speed</label>
                                <input type="text" value={exif.shutterSpeed} onChange={e => setExif({ ...exif, shutterSpeed: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>ISO</label>
                                <input type="text" value={exif.iso} onChange={e => setExif({ ...exif, iso: e.target.value })} />
                            </div>
                        </div>

                        <button className="download-btn" onClick={downloadImage}>
                            Save Framed Image
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
