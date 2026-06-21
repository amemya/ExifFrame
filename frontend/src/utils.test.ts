import { describe, it, expect } from 'vitest';
import { getQualityFromBPP, getExportInfo } from './utils';

describe('getQualityFromBPP', () => {
    it('returns the numeric value if setting is not "auto"', () => {
        expect(getQualityFromBPP(0.5, "0.85")).toBe(0.85);
        expect(getQualityFromBPP(undefined, "0.99")).toBe(0.99);
    });

    it('returns 0.92 if bpp is undefined or <= 0', () => {
        expect(getQualityFromBPP(undefined, "auto")).toBe(0.92);
        expect(getQualityFromBPP(-1, "auto")).toBe(0.92);
        expect(getQualityFromBPP(0, "auto")).toBe(0.92);
    });

    it('interpolates correctly for typical BPP ranges', () => {
        // minBPP (0.05) -> minQ (0.70)
        expect(getQualityFromBPP(0.05, "auto")).toBe(0.70);
        
        // maxBPP (0.30) -> maxQ (0.92)
        expect(getQualityFromBPP(0.30, "auto")).toBe(0.92);

        // mid point: 0.175 -> ~0.81
        const midResult = getQualityFromBPP(0.175, "auto");
        expect(midResult).toBeCloseTo(0.81);
    });

    it('clamps the quality between 0.65 and 0.95', () => {
        // very low BPP
        expect(getQualityFromBPP(0.01, "auto")).toBeCloseTo(0.6648); // within bounds
        // very high BPP
        expect(getQualityFromBPP(1.0, "auto")).toBe(0.95);
    });
});

describe('getExportInfo', () => {
    it('determines png info correctly', () => {
        const info = getExportInfo('/path/to/image.png', 'image/png');
        expect(info.isPng).toBe(true);
        expect(info.targetMime).toBe('image/png');
        expect(info.baseName).toBe('image');
        expect(info.exportName).toBe('image_ExifFrame.png');
    });

    it('determines jpeg info correctly', () => {
        const info = getExportInfo('/path/to/photo.jpg', 'image/jpeg');
        expect(info.isPng).toBe(false);
        expect(info.targetMime).toBe('image/jpeg');
        expect(info.baseName).toBe('photo');
        expect(info.exportName).toBe('photo_ExifFrame.jpg');
    });

    it('handles files without extensions', () => {
        const info = getExportInfo('filename', 'image/jpeg');
        expect(info.baseName).toBe('filename');
        expect(info.exportName).toBe('filename_ExifFrame.jpg');
    });

    it('handles empty filePath safely', () => {
        const info = getExportInfo('', 'image/jpeg');
        expect(info.baseName).toBe('exif-frame');
        expect(info.exportName).toBe('exif-frame_ExifFrame.jpg');
    });
});
