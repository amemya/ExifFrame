export interface FrameSettingsPanelProps {
    aspectRatioPreset: string;
    setAspectRatioPreset: (val: string) => void;
    customRatioW: number;
    setCustomRatioW: (val: number) => void;
    customRatioH: number;
    setCustomRatioH: (val: number) => void;
    orientation: "landscape" | "portrait";
    setOrientation: (val: "landscape" | "portrait") => void;
    alignment: "top" | "center";
    setAlignment: (val: "top" | "center") => void;
    showPipeSeparator: boolean;
    setShowPipeSeparator: (val: boolean) => void;
    frameColor: string;
    setFrameColor: (val: string) => void;
    textColor: string;
    setTextColor: (val: string) => void;
}

export const FrameSettingsPanel = ({
    aspectRatioPreset, setAspectRatioPreset,
    customRatioW, setCustomRatioW,
    customRatioH, setCustomRatioH,
    orientation, setOrientation,
    alignment, setAlignment,
    showPipeSeparator, setShowPipeSeparator,
    frameColor, setFrameColor,
    textColor, setTextColor
}: FrameSettingsPanelProps) => (
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
        
        <div className="input-row" style={{ marginTop: '1rem' }}>
            <div className="input-group">
                <label htmlFor="frame-color">Frame Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                        id="frame-color"
                        type="color"
                        value={frameColor}
                        onChange={(e) => setFrameColor(e.target.value)}
                        style={{ width: '100%', height: '36px', padding: '0', cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'transparent' }}
                    />
                </div>
            </div>
            <div className="input-group">
                <label htmlFor="text-color">Text Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                        id="text-color"
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        style={{ width: '100%', height: '36px', padding: '0', cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'transparent' }}
                    />
                </div>
            </div>
        </div>
    </div>
);
