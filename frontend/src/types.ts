export interface ExifData {
    camera: string;
    lens: string;
    focalLength: string;
    aperture: string;
    shutterSpeed: string;
    iso: string;
    film: string;
    developer: string;
    dilution: string;
    temperature: string;
    time: string;
}

export interface MetadataVisibility {
    camera: boolean;
    lens: boolean;
    focalLength: boolean;
    aperture: boolean;
    shutterSpeed: boolean;
    iso: boolean;
    film: boolean;
    developer: boolean;
    dilution: boolean;
    temperature: boolean;
    time: boolean;
}

export const VISIBILITY_KEYS = [
    'camera', 'lens', 'focalLength', 'aperture', 'shutterSpeed', 'iso',
    'film', 'developer', 'dilution', 'temperature', 'time',
] as const;

export const settingsKey = (k: typeof VISIBILITY_KEYS[number]) =>
    k === 'iso' ? 'visibilityISO' : `visibility${k.charAt(0).toUpperCase()}${k.slice(1)}`;

export function toVisibility(s: Record<string, unknown>): MetadataVisibility {
    const result: Partial<MetadataVisibility> = {};
    VISIBILITY_KEYS.forEach(k => {
        const val = s[settingsKey(k)];
        result[k] = typeof val === 'boolean' ? val : true;
    });
    return result as MetadataVisibility;
}

export function applyVisibility(s: Record<string, unknown>, v: MetadataVisibility): void {
    VISIBILITY_KEYS.forEach(k => { s[settingsKey(k)] = v[k]; });
}
