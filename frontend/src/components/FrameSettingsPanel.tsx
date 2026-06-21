import { useState, useEffect } from 'react';
// @ts-expect-error generated bindings
import { App as AppAPI } from '../../bindings/ExifFrame/index';
import { DEFAULT_FONT_FAMILY, CSS_GENERIC_FONTS } from '../types';

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
    fontFamily: string;
    setFontFamily: (val: string) => void;
    onApplyToAll?: (scope: 'all' | 'colors' | 'ratios' | 'text') => void;
}

export const FrameSettingsPanel = ({
    aspectRatioPreset, setAspectRatioPreset,
    customRatioW, setCustomRatioW,
    customRatioH, setCustomRatioH,
    orientation, setOrientation,
    alignment, setAlignment,
    showPipeSeparator, setShowPipeSeparator,
    frameColor, setFrameColor,
    textColor, setTextColor,
    fontFamily, setFontFamily,
    onApplyToAll
}: FrameSettingsPanelProps) => {
    const [systemFonts, setSystemFonts] = useState<string[]>([]);
    const [isLoadingFonts, setIsLoadingFonts] = useState<boolean>(true);
    const [applyMenuVisible, setApplyMenuVisible] = useState(false);
    const [confirmScope, setConfirmScope] = useState<'all' | 'colors' | 'ratios' | 'text' | null>(null);

    const handleApplyWithConfirm = (scope: 'all' | 'colors' | 'ratios' | 'text') => {
        setConfirmScope(scope);
        setApplyMenuVisible(false);
    };

    const confirmApply = () => {
        if (confirmScope && onApplyToAll) {
            onApplyToAll(confirmScope);
        }
        setConfirmScope(null);
    };

    useEffect(() => {
        if (!confirmScope) return;
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setConfirmScope(null);
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [confirmScope]);

    useEffect(() => {
        let isMounted = true;
        AppAPI.GetSystemFonts().then((fonts: string[]) => {
            if (isMounted) {
                setSystemFonts(fonts || []);
                setIsLoadingFonts(false);
            }
        }).catch((e: unknown) => {
            console.error("Failed to load system fonts", e);
            if (isMounted) {
                setIsLoadingFonts(false);
            }
        });
        return () => { isMounted = false; };
    }, []);

    return (
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

        <div className="input-group" style={{ marginTop: '1rem' }}>
            <label htmlFor="font-family">Font</label>
            <select
                id="font-family"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
            >
                {fontFamily && fontFamily !== DEFAULT_FONT_FAMILY && !CSS_GENERIC_FONTS.includes(fontFamily) && !systemFonts.includes(fontFamily) && (
                    <option value={fontFamily}>{fontFamily} {!isLoadingFonts ? "(Missing)" : ""}</option>
                )}
                <option value={DEFAULT_FONT_FAMILY}>Default ({DEFAULT_FONT_FAMILY})</option>
                <option value="sans-serif">System Sans-Serif</option>
                <option value="serif">System Serif</option>
                <option value="monospace">System Monospace</option>
                {isLoadingFonts && <optgroup label="System Fonts">
                    <option disabled>Loading system fonts...</option>
                </optgroup>}
                {!isLoadingFonts && systemFonts.length > 0 && <optgroup label="System Fonts">
                    {systemFonts.map(font => {
                        const styleFontValue = `"${font}", sans-serif`;
                        return (
                            <option key={font} value={font} style={{ fontFamily: styleFontValue }}>{font}</option>
                        );
                    })}
                </optgroup>}
            </select>
        </div>

        {onApplyToAll && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <div 
                    className="btn-group" 
                    style={{ width: '100%', display: 'flex' }}
                    tabIndex={-1}
                    onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setApplyMenuVisible(false);
                        }
                    }}
                >
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '0.85rem' }}
                        onClick={() => handleApplyWithConfirm('all')}
                    >
                        Apply All Frame Settings
                    </button>
                    <div className="dropdown" style={{ display: 'flex' }}>
                        <button
                            type="button"
                            className="btn btn-secondary dropdown-toggle"
                            aria-label="More apply options"
                            onClick={() => setApplyMenuVisible(v => !v)}
                            style={{ padding: '0 0.5rem' }}
                        >
                            ▼
                        </button>
                        {applyMenuVisible && (
                            <div className="dropdown-menu" style={{ right: 0, left: 'auto', bottom: '100%', top: 'auto', marginBottom: '0.25rem' }}>
                                <button className="dropdown-item" onClick={() => { setApplyMenuVisible(false); handleApplyWithConfirm('colors'); }}>Apply Colors to All</button>
                                <button className="dropdown-item" onClick={() => { setApplyMenuVisible(false); handleApplyWithConfirm('ratios'); }}>Apply Ratios & Orientation to All</button>
                                <button className="dropdown-item" onClick={() => { setApplyMenuVisible(false); handleApplyWithConfirm('text'); }}>Apply Text Settings to All</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {confirmScope && (
            <div className="modal-overlay" onClick={() => setConfirmScope(null)} style={{ zIndex: 3000 }}>
                <div className="modal-content" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                    <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', marginTop: 0 }}>Confirm Apply Frame Settings</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                        {confirmScope === 'colors' ? "Apply frame and text colors to all images?" :
                         confirmScope === 'ratios' ? "Apply aspect ratio and orientation to all images?\n\nNote: This will force all images to match the current landscape/portrait orientation." :
                         confirmScope === 'text' ? "Apply text layout and fonts to all images?" :
                         "Apply all frame settings to all images?\n\nNote: Individual settings will be overwritten."}
                    </p>
                    <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => setConfirmScope(null)}>Cancel</button>
                        <button className="btn btn-primary" onClick={confirmApply}>Apply</button>
                    </div>
                </div>
            </div>
        )}
    </div>
    );
};
