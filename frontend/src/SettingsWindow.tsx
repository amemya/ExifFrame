import { useState, useEffect } from 'react';
import './App.css';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI, Settings } from '../bindings/ExifFrame/index';
import { Events, System } from '@wailsio/runtime';

function SettingsWindow() {
    const [watchFolder, setWatchFolder] = useState("");
    const [exportFolder, setExportFolder] = useState("");
    const [fullSettings, setFullSettings] = useState<Settings | null>(null);
    const [isMac, setIsMac] = useState(false);

    useEffect(() => {
        setIsMac(System.IsMac());

        // Load initial settings
        AppAPI.GetSettings().then((s: Settings) => {
            setFullSettings(s);
            setWatchFolder(s.watchFolder || "");
            setExportFolder(s.exportFolder || "");
        }).catch((err: any) => console.error("Failed to load settings:", err));

        // Listen for settings_saved from main window
        const unsub = Events.On("settings_saved", () => {
            AppAPI.GetSettings().then((s: Settings) => {
                setFullSettings(s);
                setWatchFolder(s.watchFolder || "");
                setExportFolder(s.exportFolder || "");
            }).catch((err: any) => console.error("Failed to reload settings:", err));
        });

        return () => {
            unsub();
        };
    }, []);

    const handleSave = async (newWatch: string, newExport: string) => {
        if (!fullSettings) return;

        const s = new Settings();
        // Copy existing settings
        Object.assign(s, fullSettings);

        // Update folders
        s.watchFolder = newWatch;
        s.exportFolder = newExport;

        try {
            const errStr = await AppAPI.SaveSettings(s);
            if (errStr && errStr !== "") {
                console.error(errStr);
                alert(errStr);
                return;
            }

            // Update local state
            setWatchFolder(newWatch);
            setExportFolder(newExport);
            setFullSettings(s);

            // Notify other windows
            Events.Emit("settings_saved");
        } catch (e: any) {
            console.error("Error saving settings", e);
        }
    };

    return (
        <div className={`app-container ${isMac ? 'mac-os' : ''}`} style={{ height: '100vh', overflow: 'hidden' }}>
            <header className="top-bar">
                <h1>Preferences</h1>
            </header>
            <main className="workspace" style={{ padding: '2rem', display: 'block', height: '100%' }}>
                <div className="input-group" style={{ marginBottom: '1.5rem' }}>
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
                            if (path) handleSave(path, exportFolder);
                        }} className="btn btn-secondary">Select</button>
                        <button onClick={() => handleSave("", exportFolder)} className="btn btn-secondary" title="Clear Folder">✕</button>
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
                            if (path) handleSave(watchFolder, path);
                        }} className="btn btn-secondary">Select</button>
                        <button onClick={() => handleSave(watchFolder, "")} className="btn btn-secondary" title="Clear Folder">✕</button>
                    </div>
                    <small>Auto-processed images will be saved here.</small>
                </div>
            </main>
        </div>
    );
}

export default SettingsWindow;
