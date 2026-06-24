import { useState, useEffect, useMemo } from 'react';
import { ExifData, MetadataVisibility } from '../types';
import { ToggleInput } from './ToggleInput';
// @ts-expect-error generated bindings does not provide declaration files for JS module
import { App as AppAPI } from '../../bindings/ExifFrame/index';

export interface Recipe {
    film: string;
    developer: string;
    dilution: string;
    temp: string;
    time: string;
}

const formatFocalLength = (val: string): string => {
    const trimmed = val.trim();
    if (/^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(trimmed)) {
        return `${trimmed}mm`;
    }
    return val;
};

const formatAperture = (val: string): string => {
    const trimmed = val.trim();
    const match = trimmed.match(/^([fF]\/?\s*)?(\d+(\.\d+)?)$/);
    if (match) {
        return `f/${match[2]}`;
    }
    return val;
};

const formatShutterSpeed = (val: string): string => {
    const trimmed = val.trim();
    if (/^\d+(\/\d+)?$/.test(trimmed) || /^\d+\.\d+$/.test(trimmed)) {
        return `${trimmed}s`;
    }
    return val;
};

const formatISO = (val: string): string => {
    const trimmed = val.trim();
    const match = trimmed.match(/^(iso\s*)?(\d+)$/i);
    if (match) {
        return `ISO${match[2]}`;
    }
    return val;
};

const formatTemp = (val: string): string => {
    const trimmed = val.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return `${trimmed}℃`;
    }
    return val;
};

const formatTime = (val: string): string => {
    const trimmed = val.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return `${trimmed}min`;
    }
    return val;
};

export interface MetadataSettingsPanelProps {
    profile: string;
    setProfile: (val: string) => void;
    exif: ExifData;
    setExif: (updater: (prev: ExifData) => ExifData) => void;
    visibility: MetadataVisibility;
    setVisibility: (updater: (prev: MetadataVisibility) => MetadataVisibility) => void;
    isDefaultMode?: boolean;
    overrideExif?: boolean;
    setOverrideExif?: (val: boolean) => void;
    onApplyToAll?: () => void;
}

export const MetadataSettingsPanel = ({
    profile, setProfile,
    exif, setExif,
    visibility, setVisibility,
    isDefaultMode = false,
    overrideExif = false,
    setOverrideExif,
    onApplyToAll
}: MetadataSettingsPanelProps) => {
    const hideExifInputs = isDefaultMode && profile === 'digital' && !overrideExif;
    
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    useEffect(() => {
        AppAPI.GetFilmRecipes()
            .then((res: Recipe[]) => setRecipes(res || []))
            .catch((err: any) => console.error("Failed to load recipes", err));
    }, []);

    // Compute suggestion lists based on current inputs
    const { availableFilms, availableDevelopers, availableDilutions, availableTemps, availableTimes } = useMemo(() => {
        const availableFilms = Array.from(new Set(recipes.map(r => r.film))).filter(Boolean).sort();
        
        // Filter recipes matching the selected film (Fallback to all if invalid)
        const isFilmValid = !!exif.film && recipes.some(r => r.film === exif.film);
        const matchingRecipes = isFilmValid ? recipes.filter(r => r.film === exif.film) : recipes;
        const availableDevelopers = Array.from(new Set(matchingRecipes.map(r => r.developer))).filter(Boolean).sort();
        
        // Filter matching developer
        const isDevValid = !!exif.developer && matchingRecipes.some(r => r.developer === exif.developer);
        const matchingRecipesForDev = isDevValid ? matchingRecipes.filter(r => r.developer === exif.developer) : matchingRecipes;
        const availableDilutions = Array.from(new Set(matchingRecipesForDev.map(r => r.dilution))).filter(Boolean).sort();
        
        // Filter matching dilution
        const isDilutionValid = !!exif.dilution && matchingRecipesForDev.some(r => r.dilution === exif.dilution);
        const matchingRecipesForDilution = isDilutionValid ? matchingRecipesForDev.filter(r => r.dilution === exif.dilution) : matchingRecipesForDev;
        const availableTemps = Array.from(new Set(matchingRecipesForDilution.map(r => formatTemp(r.temp)))).filter(Boolean).sort();
        
        // Filter matching temperature to narrow down times
        const isTempValid = !!exif.temperature && matchingRecipesForDilution.some(r => formatTemp(r.temp) === exif.temperature);
        const matchingRecipesForTemp = isTempValid ? matchingRecipesForDilution.filter(r => formatTemp(r.temp) === exif.temperature) : matchingRecipesForDilution;
        const availableTimes = Array.from(new Set(matchingRecipesForTemp.map(r => formatTime(r.time)))).filter(Boolean).sort();
        
        return { availableFilms, availableDevelopers, availableDilutions, availableTemps, availableTimes };
    }, [recipes, exif.film, exif.developer, exif.dilution, exif.temperature]);

    return (
    <div className="sidebar-section metadata-settings-section">
        <div className="metadata-settings-header">
            <h3>Metadata Settings</h3>
            <div className="segmented-control profile-selector">
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

        {profile === 'digital' && isDefaultMode && setOverrideExif && (
            <div style={{ marginBottom: '1.2rem', marginTop: '1rem', padding: '0.8rem', backgroundColor: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'normal', margin: 0, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    <input 
                        type="checkbox" 
                        checked={overrideExif}
                        onChange={(e) => setOverrideExif(e.target.checked)}
                        style={{ margin: 0, width: 'auto', height: 'auto', cursor: 'pointer' }}
                    />
                    Prioritize Default Text over EXIF
                </label>
                <small style={{ display: 'block', marginTop: '0.5rem', marginLeft: '1.5rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    If enabled, the text entered here will override the actual EXIF data of processed photos.
                </small>
            </div>
        )}

        <ToggleInput
            label="Camera"
            id="camera-input"
            value={exif.camera}
            onChange={(e) => setExif(prev => ({ ...prev, camera: e.target.value }))}
            visible={visibility.camera}
            onToggleVisibility={() => setVisibility(prev => ({ ...prev, camera: !prev.camera }))}
            hideInput={hideExifInputs}
        />
        <ToggleInput
            label="Lens"
            id="lens-input"
            value={exif.lens}
            onChange={(e) => setExif(prev => ({ ...prev, lens: e.target.value }))}
            visible={visibility.lens}
            onToggleVisibility={() => setVisibility(prev => ({ ...prev, lens: !prev.lens }))}
            hideInput={hideExifInputs}
        />

        <div className="input-row">
            <ToggleInput
                label="Focal Length"
                id="focalLength-input"
                value={exif.focalLength}
                onChange={(e) => setExif(prev => ({ ...prev, focalLength: e.target.value }))}
                onBlur={() => setExif(prev => ({ ...prev, focalLength: formatFocalLength(prev.focalLength) }))}
                visible={visibility.focalLength}
                onToggleVisibility={() => setVisibility(prev => ({ ...prev, focalLength: !prev.focalLength }))}
                hideInput={hideExifInputs}
            />
            <ToggleInput
                label="Aperture"
                id="aperture-input"
                value={exif.aperture}
                onChange={(e) => setExif(prev => ({ ...prev, aperture: e.target.value }))}
                onBlur={() => setExif(prev => ({ ...prev, aperture: formatAperture(prev.aperture) }))}
                visible={visibility.aperture}
                onToggleVisibility={() => setVisibility(prev => ({ ...prev, aperture: !prev.aperture }))}
                hideInput={hideExifInputs}
            />
        </div>

        <div className="input-row">
            <ToggleInput
                label="Shutter Speed"
                id="shutterSpeed-input"
                value={exif.shutterSpeed}
                onChange={(e) => setExif(prev => ({ ...prev, shutterSpeed: e.target.value }))}
                onBlur={() => setExif(prev => ({ ...prev, shutterSpeed: formatShutterSpeed(prev.shutterSpeed) }))}
                visible={visibility.shutterSpeed}
                onToggleVisibility={() => setVisibility(prev => ({ ...prev, shutterSpeed: !prev.shutterSpeed }))}
                hideInput={hideExifInputs}
            />
            {profile === 'digital' ? (
                <ToggleInput
                    label="ISO"
                    id="iso-input"
                    value={exif.iso}
                    onChange={(e) => setExif(prev => ({ ...prev, iso: e.target.value }))}
                    onBlur={() => setExif(prev => ({ ...prev, iso: formatISO(prev.iso) }))}
                    visible={visibility.iso}
                    onToggleVisibility={() => setVisibility(prev => ({ ...prev, iso: !prev.iso }))}
                    hideInput={hideExifInputs}
                />
            ) : (
                <ToggleInput
                    label="Film"
                    id="film-input"
                    value={exif.film}
                    onChange={(e) => setExif(prev => ({ ...prev, film: e.target.value }))}
                    visible={visibility.film}
                    onToggleVisibility={() => setVisibility(prev => ({ ...prev, film: !prev.film }))}
                    suggestions={availableFilms}
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
                        suggestions={availableDevelopers}
                    />
                    <ToggleInput
                        label="Dilution"
                        id="dilution-input"
                        value={exif.dilution}
                        onChange={(e) => setExif(prev => ({ ...prev, dilution: e.target.value }))}
                        visible={visibility.dilution}
                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, dilution: !prev.dilution }))}
                        suggestions={availableDilutions}
                    />
                </div>
                <div className="input-row">
                    <ToggleInput
                        label="Temperature"
                        id="temperature-input"
                        value={exif.temperature}
                        onChange={(e) => setExif(prev => ({ ...prev, temperature: e.target.value }))}
                        onBlur={() => setExif(prev => ({ ...prev, temperature: formatTemp(prev.temperature) }))}
                        visible={visibility.temperature}
                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, temperature: !prev.temperature }))}
                        suggestions={availableTemps}
                    />
                    <ToggleInput
                        label="Time"
                        id="time-input"
                        value={exif.time}
                        onChange={(e) => setExif(prev => ({ ...prev, time: e.target.value }))}
                        onBlur={() => setExif(prev => ({ ...prev, time: formatTime(prev.time) }))}
                        visible={visibility.time}
                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, time: !prev.time }))}
                        suggestions={availableTimes}
                    />
                </div>
            </>
        )}

        {!isDefaultMode && onApplyToAll && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                <button 
                    type="button"
                    className="btn btn-secondary" 
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
                    onClick={onApplyToAll}
                    title="Apply current metadata to all imported images"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><polyline points="9 14 12 17 15 14"></polyline><line x1="12" y1="9" x2="12" y2="17"></line></svg>
                    Apply to All Images
                </button>
            </div>
        )}
    </div>
    );
};
