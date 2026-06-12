import { ExifData, MetadataVisibility } from '../types';
import { ToggleInput } from './ToggleInput';

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
}

export const MetadataSettingsPanel = ({
    profile, setProfile,
    exif, setExif,
    visibility, setVisibility,
    isDefaultMode = false,
    overrideExif = false,
    setOverrideExif
}: MetadataSettingsPanelProps) => {
    const hideExifInputs = isDefaultMode && profile === 'digital' && !overrideExif;
    
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
                visible={visibility.focalLength}
                onToggleVisibility={() => setVisibility(prev => ({ ...prev, focalLength: !prev.focalLength }))}
                hideInput={hideExifInputs}
            />
            <ToggleInput
                label="Aperture"
                id="aperture-input"
                value={exif.aperture}
                onChange={(e) => setExif(prev => ({ ...prev, aperture: e.target.value }))}
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
                    />
                    <ToggleInput
                        label="Dilution"
                        id="dilution-input"
                        value={exif.dilution}
                        onChange={(e) => setExif(prev => ({ ...prev, dilution: e.target.value }))}
                        visible={visibility.dilution}
                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, dilution: !prev.dilution }))}
                    />
                </div>
                <div className="input-row">
                    <ToggleInput
                        label="Temperature"
                        id="temperature-input"
                        value={exif.temperature}
                        onChange={(e) => setExif(prev => ({ ...prev, temperature: e.target.value }))}
                        visible={visibility.temperature}
                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, temperature: !prev.temperature }))}
                    />
                    <ToggleInput
                        label="Time"
                        id="time-input"
                        value={exif.time}
                        onChange={(e) => setExif(prev => ({ ...prev, time: e.target.value }))}
                        visible={visibility.time}
                        onToggleVisibility={() => setVisibility(prev => ({ ...prev, time: !prev.time }))}
                    />
                </div>
            </>
        )}
    </div>
    );
};
