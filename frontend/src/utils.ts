/**
 * Determines export format info from a MIME type.
 */
export function getExportInfo(filePath: string, mimeType: string) {
    const isPng = mimeType === 'image/png';
    const targetMime = isPng ? 'image/png' : 'image/jpeg';
    const filenameMatch = filePath ? filePath.split(/[/\\]/).pop() : "";
    const baseName = (filenameMatch ? filenameMatch.replace(/\.[^/.]+$/, "") : "") || "exif-frame";
    const exportName = `${baseName}_ExifFrame${isPng ? '.png' : '.jpg'}`;
    return { isPng, targetMime, baseName, exportName };
}

/**
 * Calculates JPEG quality based on original Bytes-Per-Pixel and user setting.
 * - "auto": interpolates quality based on BPP for smart file-size control
 * - numeric string: uses that value directly
 */
export const getQualityFromBPP = (bpp: number | undefined, setting: string): number => {
    if (setting !== "auto") {
        const parsed = parseFloat(setting);
        if (!isNaN(parsed)) return parsed;
    }
    if (bpp === undefined || bpp <= 0) return 0.92;

    // Continuous interpolation for smoother scaling
    // Map BPP 0.05 -> Quality 0.70 (Aggressive compression for huge/noisy files)
    // Map BPP 0.30 -> Quality 0.92 (High quality for standard files)
    const minBPP = 0.05;
    const maxBPP = 0.30;
    const minQ = 0.70;
    const maxQ = 0.92;

    let quality = minQ + ((bpp - minBPP) * (maxQ - minQ)) / (maxBPP - minBPP);
    
    // Clamp between 0.65 and 0.95 to avoid extreme degradation or bloat
    return Math.min(0.95, Math.max(0.65, quality));
};
