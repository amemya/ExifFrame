import { useState, useEffect } from 'react';
import './App.css';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI, Settings } from '../bindings/ExifFrame/index';
import { Events, System } from '@wailsio/runtime';
import { FrameSettingsPanel } from './components/FrameSettingsPanel';
import { MetadataSettingsPanel } from './components/MetadataSettingsPanel';
import { ExifData, MetadataVisibility, toVisibility, applyVisibility, DEFAULT_FONT_FAMILY } from './types';
import { useToast } from './hooks/useToast';

function SettingsWindow() {
    const [activeTab, setActiveTab] = useState<'general' | 'frame' | 'metadata'>('general');
    const [isMac, setIsMac] = useState(false);
    const toast = useToast();
    const showToast = toast.show;

    // General
    const [watchFolder, setWatchFolder] = useState("");
    const [exportFolder, setExportFolder] = useState("");
    const [jpegQuality, setJpegQuality] = useState("auto");

    // Frame Settings
    const [aspectRatioPreset, setAspectRatioPreset] = useState<string>("4300:3618");
    const [customRatioW, setCustomRatioW] = useState<number>(4300);
    const [customRatioH, setCustomRatioH] = useState<number>(3618);
    const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
    const [alignment, setAlignment] = useState<"top" | "center">("center");
    const [showPipeSeparator, setShowPipeSeparator] = useState<boolean>(true);
    const [frameColor, setFrameColor] = useState<string>("#ffffff");
    const [textColor, setTextColor] = useState<string>("#000000");
    const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_FAMILY);

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
        setJpegQuality(s.jpegQuality || "auto");

        setAspectRatioPreset(s.aspectRatioPreset || "4300:3618");
        setCustomRatioW(s.customRatioW || 4300);
        setCustomRatioH(s.customRatioH || 3618);
        setOrientation(s.orientation || "landscape");
        setAlignment(s.alignment || "center");
        setShowPipeSeparator(s.showPipeSeparator ?? true);
        setFrameColor(s.frameColor || "#ffffff");
        setTextColor(s.textColor || "#000000");
        setFontFamily(s.fontFamily || DEFAULT_FONT_FAMILY);

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
        s.jpegQuality = jpegQuality;
        s.aspectRatioPreset = aspectRatioPreset;
        s.customRatioW = customRatioW;
        s.customRatioH = customRatioH;
        s.orientation = orientation;
        s.alignment = alignment;
        s.showPipeSeparator = showPipeSeparator;
        s.frameColor = frameColor;
        s.textColor = textColor;
        s.fontFamily = fontFamily;

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
                            <div className="input-group">
                                <label>JPEG Export Quality</label>
                                <select 
                                    value={jpegQuality} 
                                    onChange={(e) => setJpegQuality(e.target.value)}
                                    className="select-input"
                                >
                                    <option value="auto">Auto (Smart Adjust based on source)</option>
                                    <option value="1.0">Maximum (100% - Huge file size)</option>
                                    <option value="0.95">Very High (95%)</option>
                                    <option value="0.9">High (90%)</option>
                                    <option value="0.85">Medium (85% - Recommended for SNS)</option>
                                    <option value="0.8">Low (80%)</option>
                                </select>
                                <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)', textAlign: 'left' }}>Auto calculates the optimal quality based on the original image compression to prevent file size bloat.</small>
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
                                fontFamily={fontFamily} setFontFamily={setFontFamily}
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

            {toast.element}

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
