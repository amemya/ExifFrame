import { useState, useEffect, useRef } from 'react';
import './App.css';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI, Settings } from '../bindings/ExifFrame/index';
import { Events, System } from '@wailsio/runtime';
import { FrameSettingsPanel } from './components/FrameSettingsPanel';
import { MetadataSettingsPanel } from './components/MetadataSettingsPanel';
import { ExifData, MetadataVisibility, toVisibility, applyVisibility } from './types';

const TOAST_DURATION_MS = 3000;

function SettingsWindow() {
    const [activeTab, setActiveTab] = useState<'general' | 'frame' | 'metadata'>('general');
    const [isMac, setIsMac] = useState(false);

    // Toast State
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

    // General
    const [watchFolder, setWatchFolder] = useState("");
    const [exportFolder, setExportFolder] = useState("");

    // Frame Settings
    const [aspectRatioPreset, setAspectRatioPreset] = useState<string>("4300:3618");
    const [customRatioW, setCustomRatioW] = useState<number>(4300);
    const [customRatioH, setCustomRatioH] = useState<number>(3618);
    const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
    const [alignment, setAlignment] = useState<"top" | "center">("center");
    const [showPipeSeparator, setShowPipeSeparator] = useState<boolean>(true);
    const [frameColor, setFrameColor] = useState<string>("#ffffff");
    const [textColor, setTextColor] = useState<string>("#000000");

    // Metadata Settings
    const [profile, setProfile] = useState<string>("digital");
    const [exif, setExif] = useState<ExifData>({
        camera: "", lens: "", focalLength: "", aperture: "", shutterSpeed: "",
        iso: "", film: "", developer: "", dilution: "", temperature: "", time: ""
    });
    const [visibility, setVisibility] = useState<MetadataVisibility>({
        camera: true, lens: true, focalLength: true, aperture: true, shutterSpeed: true,
        iso: true, film: true, developer: true, dilution: true, temperature: true, time: true
    });
    const [overrideExif, setOverrideExif] = useState<boolean>(false);

    const loadSettings = (s: Settings) => {
        setWatchFolder(s.watchFolder || "");
        setExportFolder(s.exportFolder || "");

        setAspectRatioPreset(s.aspectRatioPreset || "4300:3618");
        setCustomRatioW(s.customRatioW || 4300);
        setCustomRatioH(s.customRatioH || 3618);
        setOrientation(s.orientation || "landscape");
        setAlignment(s.alignment || "center");
        setShowPipeSeparator(s.showPipeSeparator ?? true);
        setFrameColor(s.frameColor || "#ffffff");
        setTextColor(s.textColor || "#000000");

        setProfile(s.profile || "digital");
        setOverrideExif(s.overrideExif ?? false);
        setExif({
            camera: s.camera || "",
            lens: s.lens || "",
            focalLength: s.focalLength || "",
            aperture: s.aperture || "",
            shutterSpeed: s.shutterSpeed || "",
            iso: s.iso || "",
            film: s.film || "",
            developer: s.developer || "",
            dilution: s.dilution || "",
            temperature: s.temperature || "",
            time: s.time || ""
        });
        setVisibility(toVisibility(s));
    };

    useEffect(() => {
        setIsMac(System.IsMac());

        // Load initial settings
        AppAPI.GetSettings().then(loadSettings).catch((err: any) => console.error("Failed to load settings:", err));

        // Listen for settings_saved from main window
        const unsub = Events.On("settings_saved", () => {
            AppAPI.GetSettings().then(loadSettings).catch((err: any) => console.error("Failed to reload settings:", err));
        });

        return () => {
            unsub();
        };
    }, []);

    const handleSave = async () => {
        const s = new Settings();

        s.watchFolder = watchFolder;
        s.exportFolder = exportFolder;
        s.aspectRatioPreset = aspectRatioPreset;
        s.customRatioW = customRatioW;
        s.customRatioH = customRatioH;
        s.orientation = orientation;
        s.alignment = alignment;
        s.showPipeSeparator = showPipeSeparator;
        s.frameColor = frameColor;
        s.textColor = textColor;

        s.profile = profile;
        s.overrideExif = overrideExif;
        s.camera = exif.camera;
        s.lens = exif.lens;
        s.focalLength = exif.focalLength;
        s.aperture = exif.aperture;
        s.shutterSpeed = exif.shutterSpeed;
        s.iso = exif.iso;
        s.film = exif.film;
        s.developer = exif.developer;
        s.dilution = exif.dilution;
        s.temperature = exif.temperature;
        s.time = exif.time;

        applyVisibility(s, visibility);

        try {
            const errStr = await AppAPI.SaveSettings(s);
            if (errStr && errStr !== "") {
                console.error(errStr);
                alert(errStr);
                return;
            }

            // Notify other windows
            Events.Emit("settings_saved");

            showToast("Settings saved successfully.");
        } catch (e: any) {
            console.error("Error saving settings", e);
        }
    };

    return (
        <div className={`app-container ${isMac ? 'mac-os' : ''}`} style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-main)' }}>
            <header className="top-bar" style={{ flexShrink: 0, '--wails-draggable': 'drag' } as any}>
                <h1>Preferences</h1>
            </header>

            <div className="workspace" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <aside className="sidebar" style={{ width: '220px', borderRight: '1px solid var(--border-color)', flexShrink: 0 }}>
                    <div className="sidebar-section" style={{ borderBottom: 'none' }}>
                        <button className={`nav-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
                            General
                        </button>
                        <button className={`nav-btn ${activeTab === 'frame' ? 'active' : ''}`} onClick={() => setActiveTab('frame')}>
                            Frame Defaults
                        </button>
                        <button className={`nav-btn ${activeTab === 'metadata' ? 'active' : ''}`} onClick={() => setActiveTab('metadata')}>
                            Metadata Defaults
                        </button>
                    </div>
                </aside>

                <main style={{ flex: 1, padding: '2rem', overflowY: 'auto', backgroundColor: 'var(--bg-main)' }}>
                    {activeTab === 'general' && (
                        <div>
                            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', textAlign: 'left' }}>General Settings</h2>
                            <div className="input-group" style={{ marginBottom: '2rem' }}>
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
                                <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)', textAlign: 'left' }}>Images dropped here will be processed automatically.</small>
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
                                <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)', textAlign: 'left' }}>Auto-processed images will be saved here.</small>
                            </div>
                        </div>
                    )}
                    {activeTab === 'frame' && (
                        <div>
                            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', textAlign: 'left' }}>Frame Defaults</h2>
                            <FrameSettingsPanel
                                aspectRatioPreset={aspectRatioPreset} setAspectRatioPreset={setAspectRatioPreset}
                                customRatioW={customRatioW} setCustomRatioW={setCustomRatioW}
                                customRatioH={customRatioH} setCustomRatioH={setCustomRatioH}
                                orientation={orientation} setOrientation={setOrientation}
                                alignment={alignment} setAlignment={setAlignment}
                                showPipeSeparator={showPipeSeparator} setShowPipeSeparator={setShowPipeSeparator}
                                frameColor={frameColor} setFrameColor={setFrameColor}
                                textColor={textColor} setTextColor={setTextColor}
                            />
                        </div>
                    )}
                    {activeTab === 'metadata' && (
                        <div>
                            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', textAlign: 'left' }}>Metadata Defaults</h2>
                            <MetadataSettingsPanel
                                profile={profile} setProfile={setProfile}
                                exif={exif} setExif={setExif}
                                visibility={visibility} setVisibility={setVisibility}
                                isDefaultMode={true}
                                overrideExif={overrideExif}
                                setOverrideExif={setOverrideExif}
                            />
                        </div>
                    )}
                </main>
            </div>

            {toastMessage && (
                <div className="toast-container" aria-live="polite" aria-atomic="true" role="status">
                    <div className="toast success" style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}>{toastMessage}</div>
                </div>
            )}

            <footer style={{
                padding: '1rem 2rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: 'var(--bg-panel)',
                flexShrink: 0
            }}>
                <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
            </footer>
        </div>
    );
}

export default SettingsWindow;
