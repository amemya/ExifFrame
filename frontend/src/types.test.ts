import { describe, it, expect } from 'vitest';
import {
    settingsKey,
    toVisibility,
    applyVisibility,
    VISIBILITY_KEYS,
    type MetadataVisibility,
} from './types';

// ---------------------------------------------------------------------------
// settingsKey
// ---------------------------------------------------------------------------

describe('settingsKey', () => {
    it('maps "iso" to "visibilityISO" (special case)', () => {
        expect(settingsKey('iso')).toBe('visibilityISO');
    });

    it('maps standard keys with uppercase first letter', () => {
        expect(settingsKey('camera')).toBe('visibilityCamera');
        expect(settingsKey('lens')).toBe('visibilityLens');
        expect(settingsKey('focalLength')).toBe('visibilityFocalLength');
        expect(settingsKey('aperture')).toBe('visibilityAperture');
        expect(settingsKey('shutterSpeed')).toBe('visibilityShutterSpeed');
        expect(settingsKey('film')).toBe('visibilityFilm');
        expect(settingsKey('developer')).toBe('visibilityDeveloper');
        expect(settingsKey('dilution')).toBe('visibilityDilution');
        expect(settingsKey('temperature')).toBe('visibilityTemperature');
        expect(settingsKey('time')).toBe('visibilityTime');
    });

    it('covers all VISIBILITY_KEYS without collisions', () => {
        const mapped = VISIBILITY_KEYS.map(settingsKey);
        // Ensure every key produces a non-empty visibility-prefixed string
        for (const result of mapped) {
            expect(result).toBeTruthy();
            expect(result.startsWith('visibility')).toBe(true);
        }
        // Ensure no two keys collide on the same settings key
        expect(new Set(mapped).size).toBe(VISIBILITY_KEYS.length);
    });
});

// ---------------------------------------------------------------------------
// toVisibility
// ---------------------------------------------------------------------------

describe('toVisibility', () => {
    it('returns all true when settings have all visibility flags set', () => {
        const settings: Record<string, unknown> = {};
        for (const k of VISIBILITY_KEYS) {
            settings[settingsKey(k)] = true;
        }
        const vis = toVisibility(settings);
        for (const k of VISIBILITY_KEYS) {
            expect(vis[k]).toBe(true);
        }
    });

    it('returns false for explicitly false flags', () => {
        const settings: Record<string, unknown> = {};
        for (const k of VISIBILITY_KEYS) {
            settings[settingsKey(k)] = false;
        }
        const vis = toVisibility(settings);
        for (const k of VISIBILITY_KEYS) {
            expect(vis[k]).toBe(false);
        }
    });

    it('defaults missing values to true', () => {
        const vis = toVisibility({});
        for (const k of VISIBILITY_KEYS) {
            expect(vis[k]).toBe(true);
        }
    });

    it('treats non-boolean values as true (default)', () => {
        const settings: Record<string, unknown> = {
            visibilityCamera: 'yes',
            visibilityLens: 1,
            visibilityISO: null,
        };
        const vis = toVisibility(settings);
        expect(vis.camera).toBe(true);
        expect(vis.lens).toBe(true);
        expect(vis.iso).toBe(true);
    });

    it('handles mixed true/false flags', () => {
        const settings: Record<string, unknown> = {
            visibilityCamera: true,
            visibilityLens: false,
            visibilityFocalLength: true,
            visibilityAperture: false,
        };
        const vis = toVisibility(settings);
        expect(vis.camera).toBe(true);
        expect(vis.lens).toBe(false);
        expect(vis.focalLength).toBe(true);
        expect(vis.aperture).toBe(false);
        // Missing keys default to true
        expect(vis.shutterSpeed).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// applyVisibility
// ---------------------------------------------------------------------------

describe('applyVisibility', () => {
    it('writes visibility flags to settings object', () => {
        const settings: Record<string, unknown> = {};
        const vis: MetadataVisibility = {
            camera: true,
            lens: false,
            focalLength: true,
            aperture: false,
            shutterSpeed: true,
            iso: false,
            film: true,
            developer: false,
            dilution: true,
            temperature: false,
            time: true,
        };
        applyVisibility(settings, vis);

        expect(settings['visibilityCamera']).toBe(true);
        expect(settings['visibilityLens']).toBe(false);
        expect(settings['visibilityFocalLength']).toBe(true);
        expect(settings['visibilityAperture']).toBe(false);
        expect(settings['visibilityShutterSpeed']).toBe(true);
        expect(settings['visibilityISO']).toBe(false);
        expect(settings['visibilityFilm']).toBe(true);
        expect(settings['visibilityDeveloper']).toBe(false);
        expect(settings['visibilityDilution']).toBe(true);
        expect(settings['visibilityTemperature']).toBe(false);
        expect(settings['visibilityTime']).toBe(true);
    });

    it('overwrites existing values in the settings object', () => {
        const settings: Record<string, unknown> = {
            visibilityCamera: false,
            visibilityLens: true,
        };
        const vis: MetadataVisibility = {
            camera: true,
            lens: false,
            focalLength: true,
            aperture: true,
            shutterSpeed: true,
            iso: true,
            film: true,
            developer: true,
            dilution: true,
            temperature: true,
            time: true,
        };
        applyVisibility(settings, vis);

        expect(settings['visibilityCamera']).toBe(true);
        expect(settings['visibilityLens']).toBe(false);
    });

    it('preserves unrelated keys in the settings object', () => {
        const settings: Record<string, unknown> = {
            watchFolder: '/photos',
            exportFolder: '/export',
            frameColor: '#ffffff',
            visibilityCamera: false,
        };
        const vis: MetadataVisibility = {
            camera: true,
            lens: true,
            focalLength: true,
            aperture: true,
            shutterSpeed: true,
            iso: true,
            film: true,
            developer: true,
            dilution: true,
            temperature: true,
            time: true,
        };
        applyVisibility(settings, vis);

        // Visibility keys are updated
        expect(settings['visibilityCamera']).toBe(true);
        // Unrelated keys are preserved
        expect(settings['watchFolder']).toBe('/photos');
        expect(settings['exportFolder']).toBe('/export');
        expect(settings['frameColor']).toBe('#ffffff');
    });
});

// ---------------------------------------------------------------------------
// roundtrip: applyVisibility -> toVisibility
// ---------------------------------------------------------------------------

describe('roundtrip applyVisibility -> toVisibility', () => {
    it('preserves all values through a round trip', () => {
        const original: MetadataVisibility = {
            camera: true,
            lens: false,
            focalLength: true,
            aperture: false,
            shutterSpeed: true,
            iso: false,
            film: true,
            developer: false,
            dilution: true,
            temperature: false,
            time: true,
        };

        const settings: Record<string, unknown> = {};
        applyVisibility(settings, original);
        const restored = toVisibility(settings);

        for (const k of VISIBILITY_KEYS) {
            expect(restored[k]).toBe(original[k]);
        }
    });

    it('works with all-true values', () => {
        const allTrue: MetadataVisibility = {
            camera: true,
            lens: true,
            focalLength: true,
            aperture: true,
            shutterSpeed: true,
            iso: true,
            film: true,
            developer: true,
            dilution: true,
            temperature: true,
            time: true,
        };

        const settings: Record<string, unknown> = {};
        applyVisibility(settings, allTrue);
        const restored = toVisibility(settings);

        for (const k of VISIBILITY_KEYS) {
            expect(restored[k]).toBe(true);
        }
    });

    it('works with all-false values', () => {
        const allFalse: MetadataVisibility = {
            camera: false,
            lens: false,
            focalLength: false,
            aperture: false,
            shutterSpeed: false,
            iso: false,
            film: false,
            developer: false,
            dilution: false,
            temperature: false,
            time: false,
        };

        const settings: Record<string, unknown> = {};
        applyVisibility(settings, allFalse);
        const restored = toVisibility(settings);

        for (const k of VISIBILITY_KEYS) {
            expect(restored[k]).toBe(false);
        }
    });
});
