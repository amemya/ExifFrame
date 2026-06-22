import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import './App.css';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI, Settings, UpdateStatus } from '../bindings/ExifFrame/index';
import { Window, Events, System, Call, Browser } from '@wailsio/runtime';

import { ExifData, MetadataVisibility, toVisibility, applyVisibility, ImportedImage, ExifResult, DEFAULT_FONT_FAMILY } from './types';
import { FrameSettingsPanel } from './components/FrameSettingsPanel';
import { MetadataSettingsPanel } from './components/MetadataSettingsPanel';
import { useToast } from './hooks/useToast';
import { getQualityFromBPP, getExportInfo } from './utils';
import { renderImageToCanvas } from './canvas';

import { useBackgroundProcessor } from './hooks/useBackgroundProcessor';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useImageManager } from './hooks/useImageManager';
import { useExport } from './hooks/useExport';
import { useUpdater } from './hooks/useUpdater';

// Re-export for backward compatibility
export { getQualityFromBPP } from './utils';

function App() {
    const toast = useToast();
    const showToast = toast.show;

    const [isSelecting, setIsSelecting] = useState(false);
    const isSelectingRef = useRef(false);
    const [isMac, setIsMac] = useState(false);
    const [exportMenuVisible, setExportMenuVisible] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useBackgroundProcessor();
    const { updateState, dismissUpdateError, triggerUpdate, restartApp } = useUpdater();

    // Note: To resolve a circular dependency between useSettingsSync and useImageManager,
    // we use a ref for setExif. Since useSettingsSync fetches asynchronously inside a useEffect,
    // it will safely call the function after it's initialized. However, calling this synchronously
    // during initial render would result in a null reference.
    const setExifRef = useRef<React.Dispatch<React.SetStateAction<ExifData>> | null>(null);

    const settings = useSettingsSync({
        setExif: (action) => setExifRef.current?.(action),
        showToast
    });

    const defaultSettings = useMemo(() => ({
        frameColor: settings.globalFrameColor,
        textColor: settings.globalTextColor,
        aspectRatioPreset: settings.aspectRatioPreset,
        customRatioW: settings.customRatioW,
        customRatioH: settings.customRatioH,
        alignment: settings.alignment,
        showPipeSeparator: settings.showPipeSeparator,
        fontFamily: settings.fontFamily || DEFAULT_FONT_FAMILY
    }), [
        settings.globalFrameColor, settings.globalTextColor, settings.aspectRatioPreset,
        settings.customRatioW, settings.customRatioH, settings.alignment,
        settings.showPipeSeparator, settings.fontFamily
    ]);

    const imageManager = useImageManager(
        showToast,
        defaultSettings
    );

    useLayoutEffect(() => {
        setExifRef.current = imageManager.setExif;
    }, [imageManager.setExif]);

    const { downloadImage, downloadAllImages } = useExport({
        canvasRef,
        imageObj: imageManager.imageObj,
        currentImage: imageManager.currentImage,
        importedImages: imageManager.importedImages,
        isSelectingRef,
        setIsSelecting,
        showToast,
        profile: settings.profile,
        visibility: settings.visibility,
        globalJpegQuality: settings.globalJpegQuality
    });

    useEffect(() => {
        System.Environment().then(env => {
            setIsMac(env.OS === 'darwin');
        }).catch(err => {
            console.error("Failed to fetch environment:", err);
            setIsMac(System.IsMac());
        });
    }, []);

    useEffect(() => {
        const offFilesDropped = Events.On("files-dropped", async (e: any) => {
            let files: string[] = [];
            if (Array.isArray(e.data)) {
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
                    imageManager.handleExifResults(results);
                } catch (err: any) {
                    console.error("Failed to process dropped files:", err);
                    showToast("Failed to process files: " + (err instanceof Error ? err.message : String(err)), true);
                } finally {
                    setIsSelecting(false);
                    isSelectingRef.current = false;
                }
            }
        });

        const offImagesOpened = Events.On("images-opened", (e: any) => {
            let results: ExifResult[] = [];
            if (Array.isArray(e.data)) {
                if (e.data.length > 0 && Array.isArray(e.data[0])) {
                    results = e.data[0];
                } else {
                    results = e.data;
                }
            }
            if (results && results.length > 0) {
                if (isSelectingRef.current) return;
                isSelectingRef.current = true;
                setIsSelecting(true);
                try {
                    imageManager.handleExifResults(results);
                } catch (err: any) {
                    console.error("Failed to process opened images:", err);
                    showToast("Failed to process images: " + (err instanceof Error ? err.message : String(err)), true);
                } finally {
                    setIsSelecting(false);
                    isSelectingRef.current = false;
                }
            }
        });

        return () => { 
            offFilesDropped(); 
            offImagesOpened();
        };
    }, [imageManager.handleExifResults, showToast]);

    const handleOpenImages = useCallback(async (
        openFn: () => Promise<ExifResult[]>,
        errorLabel: string
    ) => {
        if (isSelectingRef.current) return;
        isSelectingRef.current = true;
        setIsSelecting(true);
        try {
            const results = await openFn();
            imageManager.handleExifResults(results);
        } catch (err: any) {
            console.error(`Failed to ${errorLabel}:`, err);
            showToast(`Failed to ${errorLabel}: ` + (err instanceof Error ? err.message : String(err)), true);
        } finally {
            setIsSelecting(false);
            isSelectingRef.current = false;
        }
    }, [imageManager.handleExifResults, showToast]);

    const handleAddFiles = useCallback(
        () => handleOpenImages(() => AppAPI.OpenImages(), "open images"),
        [handleOpenImages]
    );

    const drawCanvas = useCallback((img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        renderImageToCanvas(canvas, img, imageManager.exif, {
            aspectRatioPreset: imageManager.currentAspectRatioPreset,
            customRatioW: imageManager.currentCustomRatioW,
            customRatioH: imageManager.currentCustomRatioH,
            orientation: imageManager.currentOrientation,
            alignment: imageManager.currentAlignment,
            showPipeSeparator: imageManager.currentShowPipeSeparator,
            profile: settings.profile,
            visibility: settings.visibility,
            frameColor: imageManager.frameColor,
            textColor: imageManager.textColor,
            fontFamily: imageManager.currentFontFamily
        });
        imageManager.setIsCanvasReady(true);
    }, [imageManager.exif, imageManager.currentAspectRatioPreset, imageManager.currentCustomRatioW, imageManager.currentCustomRatioH, imageManager.currentOrientation, imageManager.currentAlignment, imageManager.currentShowPipeSeparator, settings.profile, settings.visibility, imageManager.frameColor, imageManager.textColor, imageManager.currentFontFamily, imageManager.setIsCanvasReady]);

    useEffect(() => {
        if (!canvasRef.current) return;
        if (imageManager.imageObj) {
            drawCanvas(imageManager.imageObj);
        }
    }, [imageManager.imageObj, drawCanvas]);

    return (
        <div className={`app-container ${isMac ? 'mac-os' : ''}`}>
            <header className="top-bar" onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                Window.Get("").ToggleMaximise();
            }}>
                <div className="top-bar-left">
                    <h1>ExifFrame</h1>
                    {updateState.stage !== 'idle' && (() => {
                        const { stage, version, downloadPct, errorMessage, releaseNotes } = updateState;
                        if (stage === 'checking') {
                            return (
                                <button className="btn btn-update" disabled title="Checking for updates...">
                                    <svg className="spinner" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line></svg>
                                    Checking...
                                </button>
                            );
                        }
                        if (stage === 'available') {
                            return (
                                <button
                                    className="btn btn-update"
                                    onClick={triggerUpdate}
                                    title={releaseNotes ? `Click to download and install the update\n\nRelease Notes:\n${releaseNotes}` : "Click to download and install the update"}
                                >
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    Update to {version}
                                </button>
                            );
                        }
                        if (stage === 'downloading') {
                            return (
                                <button className="btn btn-update btn-update--progress" disabled title="Downloading update...">
                                    <span className="update-progress-bar" style={{ width: `${downloadPct}%` }} />
                                    <span className="update-progress-text">Downloading... {downloadPct}%</span>
                                </button>
                            );
                        }
                        if (stage === 'verifying' || stage === 'installing') {
                            return (
                                <button className="btn btn-update" disabled title="Verifying update...">
                                    <svg className="spinner" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line></svg>
                                    {stage === 'verifying' ? 'Verifying...' : 'Installing...'}
                                </button>
                            );
                        }
                        if (stage === 'ready') {
                            return (
                                <button
                                    className="btn btn-update btn-update--restart"
                                    onClick={restartApp}
                                    title="Restart to apply the update"
                                >
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                                    Restart to update
                                </button>
                            );
                        }
                        if (stage === 'error') {
                            return (
                                <button
                                    className="btn btn-update btn-update--error"
                                    onClick={dismissUpdateError}
                                    title={errorMessage}
                                >
                                    Update failed
                                </button>
                            );
                        }
                        if (stage === 'restarting') {
                            return (
                                <button className="btn btn-update" disabled>
                                    Restarting...
                                </button>
                            );
                        }
                        return null;
                    })()}
                    {imageManager.filePath && <span className="file-path">{imageManager.filePath.split(/[/\\]/).filter(Boolean).join(' > ')}</span>}
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
                    {imageManager.hasImages && (
                        <div className="btn-group">
                            <button className="btn btn-primary" onClick={downloadImage} disabled={isSelecting || !imageManager.isCurrentImageLoaded}>
                                Export
                            </button>
                            {imageManager.importedImages.length > 1 && (
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
                    {!imageManager.hasImages ? (
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
                                className={`preview-canvas ${!imageManager.isCanvasReady ? 'hidden-canvas' : ''} ${!imageManager.isCurrentImageLoaded ? 'loading' : ''}`}
                                style={{ 
                                    pointerEvents: imageManager.isCurrentImageLoaded ? 'auto' : 'none'
                                }} 
                            />
                            <div className={`loading-overlay ${!imageManager.isCurrentImageLoaded && imageManager.isCanvasReady ? 'visible' : ''}`}>
                                <svg className="spinner" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }} aria-hidden="true">
                                    <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                                </svg>
                                <span>Loading...</span>
                            </div>
                        </div>
                    )}

                    {imageManager.importedImages.length > 0 && (
                        <div className="filmstrip-area">
                            {imageManager.importedImages.map((img, idx) => (
                                <button 
                                    key={img.imageURL} 
                                    type="button"
                                    className={`filmstrip-item ${imageManager.selectedIndex === idx ? 'selected' : ''}`}
                                    onClick={() => imageManager.setSelectedIndex(idx)}
                                >
                                    <img id={`thumb-${idx}`} src={img.imageURL} alt={`Thumbnail ${idx}`} loading="lazy" draggable={false} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {imageManager.hasImages && (
                    <aside className="sidebar">
                        <FrameSettingsPanel
                            aspectRatioPreset={imageManager.currentAspectRatioPreset} setAspectRatioPreset={imageManager.setPerImageAspectRatioPreset}
                            customRatioW={imageManager.currentCustomRatioW} setCustomRatioW={imageManager.setPerImageCustomRatioW}
                            customRatioH={imageManager.currentCustomRatioH} setCustomRatioH={imageManager.setPerImageCustomRatioH}
                            orientation={imageManager.currentOrientation} setOrientation={imageManager.setPerImageOrientation}
                            alignment={imageManager.currentAlignment} setAlignment={imageManager.setPerImageAlignment}
                            showPipeSeparator={imageManager.currentShowPipeSeparator} setShowPipeSeparator={imageManager.setPerImageShowPipeSeparator}
                            frameColor={imageManager.frameColor} setFrameColor={imageManager.setFrameColor}
                            textColor={imageManager.textColor} setTextColor={imageManager.setTextColor}
                            fontFamily={imageManager.currentFontFamily} setFontFamily={imageManager.setPerImageFontFamily}
                            onApplyToAll={imageManager.importedImages.length > 1 ? imageManager.handleApplySettingsToAll : undefined}
                        />

                        <MetadataSettingsPanel
                            profile={settings.profile} setProfile={settings.setProfile}
                            exif={imageManager.exif} setExif={imageManager.setExif}
                            visibility={settings.visibility} setVisibility={settings.setVisibility}
                            onApplyToAll={imageManager.importedImages.length > 1 ? imageManager.handleApplyToAll : undefined}
                        />

                        <div className="sidebar-section default-settings-section" style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => settings.handleSaveAutoExportDefault({
                                    exif: imageManager.exif,
                                    frameColor: imageManager.frameColor,
                                    textColor: imageManager.textColor,
                                    orientation: imageManager.currentOrientation,
                                    aspectRatioPreset: imageManager.currentAspectRatioPreset,
                                    customRatioW: imageManager.currentCustomRatioW,
                                    customRatioH: imageManager.currentCustomRatioH,
                                    alignment: imageManager.currentAlignment,
                                    showPipeSeparator: imageManager.currentShowPipeSeparator,
                                    fontFamily: imageManager.currentFontFamily
                                })}
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
