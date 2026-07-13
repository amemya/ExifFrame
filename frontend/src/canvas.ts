import { ExifData, MetadataVisibility, CSS_GENERIC_FONTS } from './types';

export interface RenderSettings {
    aspectRatioPreset: string;
    customRatioW: number;
    customRatioH: number;
    orientation: "landscape" | "portrait";
    alignment: "top" | "center";
    showPipeSeparator: boolean;
    profile: string;
    visibility: MetadataVisibility;
    frameColor: string;
    textColor: string;
    fontFamily: string;
}

/**
 * Calculates the Y coordinate for the image based on alignment settings.
 */
function calculateDrawY(
    alignment: "top" | "center",
    drawX: number,
    totalMarginY: number,
    minFramePadding: number,
    minTextSpace: number
): number {
    if (alignment === "center") {
        return Math.floor(totalMarginY / 2);
    }

    // 理想は上余白と横余白を同一にする（コの字均等）
    const idealDrawY = drawX;
    
    // Top配置なので、絶対に Center よりは上に配置する（差をつける）。
    // CenterのY座標の85%を上限とすることで、横幅が極端に広い場合でも
    // Centerと同じ位置になってしまう現象を防ぐ。
    const centerDrawY = Math.floor(totalMarginY / 2);
    const maxDrawYForText = totalMarginY - minTextSpace;
    const maxDrawY = Math.min(
        maxDrawYForText,
        Math.floor(centerDrawY * 0.85) 
    );
    
    return Math.max(minFramePadding, Math.min(idealDrawY, maxDrawY));
}
export function renderImageToCanvas(
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    exif: ExifData,
    settings: RenderSettings
) {
    // 画像の長辺を基準に余白を計算（縦構図の窮屈さを防ぐため）
    const baseSize = Math.max(img.width, img.height);
    const minFramePadding = Math.floor(baseSize * 0.02); // 余白サイズ調整
    // 下部のテキスト領域に必要な最小スペース
    const minTextSpace = Math.floor(minFramePadding * 4.5);

    let targetRatio = 4300 / 3618;
    if (settings.aspectRatioPreset === "custom") {
        if (settings.customRatioW > 0 && settings.customRatioH > 0) {
            targetRatio = settings.customRatioW / settings.customRatioH;
        } else {
            targetRatio = img.width / img.height;
        }
    } else {
        const [w, h] = settings.aspectRatioPreset.split(':').map(Number);
        if (w && h) targetRatio = w / h;
    }

    // Apply orientation flip
    if (settings.orientation === "portrait" && targetRatio > 1) {
        targetRatio = 1 / targetRatio;
    } else if (settings.orientation === "landscape" && targetRatio < 1) {
        targetRatio = 1 / targetRatio;
    }

    const minCanvasWidth = img.width + (minFramePadding * 2);

    // 配置設定（Top/Center）に関わらず、常に共通の最小キャンバス高さを要求する。
    // これにより設定変更によるキャンバス全体の拡大縮小（画像の相対スケール変化）を防ぐ。
    const requiredMarginY = minFramePadding + minTextSpace;
    const minCanvasHeight = img.height + (requiredMarginY * 2);

    // まず幅を基準に高さを計算
    let finalCanvasWidth = minCanvasWidth;
    let finalCanvasHeight = Math.floor(finalCanvasWidth / targetRatio);

    if (finalCanvasHeight < minCanvasHeight) {
        // 高さが足りない場合は、最小の高さを基準にして幅を拡張
        finalCanvasHeight = minCanvasHeight;
        finalCanvasWidth = Math.floor(finalCanvasHeight * targetRatio);
    }

    // ⚠️ CRITICAL: Must be set BEFORE getContext, otherwise context properties (colorSpace) are reset!
    canvas.width = finalCanvasWidth;
    canvas.height = finalCanvasHeight;

    // 画像の配置位置を計算
    const drawX = Math.floor((finalCanvasWidth - img.width) / 2);
    const totalMarginY = finalCanvasHeight - img.height;
    
    const drawY = calculateDrawY(
        settings.alignment, 
        drawX, 
        totalMarginY, 
        minFramePadding, 
        minTextSpace
    );

    // Enable P3 wide-gamut mode to prevent high-saturation color loss, with a fallback
    let ctx: CanvasRenderingContext2D | null = null;
    try {
        ctx = canvas.getContext('2d', { colorSpace: 'display-p3' } as CanvasRenderingContext2DSettings);
    } catch (e) {
        // Context with colorSpace might throw in unsupported environments
    }
    if (!ctx) {
        ctx = canvas.getContext('2d');
    }
    if (!ctx) return;

    // Fill background
    ctx.fillStyle = settings.frameColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(img, drawX, drawY);

    // 画像の下端座標
    const imgBottomY = drawY + img.height;
    // 写真の下端からキャンバスの下端までの余白
    const bottomSpaceHeight = canvas.height - imgBottomY;

    // テキストの配置Y座標は、画像の下端とキャンバス下端の中央
    const textY = imgBottomY + (bottomSpaceHeight / 2);

    // テキストのサイズは当初の通り短辺基準に戻す
    const baseScale = Math.min(img.width, img.height);

    // Settings for text
    ctx.fillStyle = settings.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const separator = settings.showPipeSeparator ? " | " : "   ";

    // Camera and Lens
    const topElements: string[] = [];
    if (settings.visibility.camera && exif.camera) topElements.push(exif.camera);
    if (settings.visibility.lens && exif.lens) topElements.push(exif.lens);
    const topText = topElements.join(separator);

    const getFontString = (size: number, family: string) => {
        if (!family || family.trim() === "") {
            return `normal ${size}px sans-serif`;
        }

        const genericFamilies = new Set(CSS_GENERIC_FONTS);

        const trimmedFamily = family.trim();
        const isGeneric = genericFamilies.has(trimmedFamily.toLowerCase());
        const hasDoubleQuotes = trimmedFamily.startsWith('"') && trimmedFamily.endsWith('"');
        const hasSingleQuotes = trimmedFamily.startsWith("'") && trimmedFamily.endsWith("'");
        const hasQuotes = hasDoubleQuotes || hasSingleQuotes;

        const escapedFamily = trimmedFamily.replace(/"/g, '\\"');
        const safeFamily = (isGeneric || hasQuotes) ? trimmedFamily : `"${escapedFamily}"`;
        return `normal ${size}px ${safeFamily}, sans-serif`;
    };

    if (topText) {
        const titleFontSize = Math.floor(baseScale * 0.035); // 当初の比率に戻す
        ctx.font = getFontString(titleFontSize, settings.fontFamily);
        ctx.fillText(topText, canvas.width / 2, textY - (titleFontSize * 0.8));
    }

    const bottomElements: string[] = [];
    if (settings.visibility.focalLength && exif.focalLength) bottomElements.push(exif.focalLength);
    if (settings.visibility.aperture && exif.aperture) bottomElements.push(exif.aperture);
    if (settings.visibility.shutterSpeed && exif.shutterSpeed) bottomElements.push(exif.shutterSpeed);

    if (settings.profile === "film") {
        if (settings.visibility.film && exif.film) bottomElements.push(exif.film);
        if (settings.visibility.developer && exif.developer) bottomElements.push(exif.developer);
        if (settings.visibility.dilution && exif.dilution) bottomElements.push(exif.dilution);
        if (settings.visibility.temperature && exif.temperature) bottomElements.push(exif.temperature);
        if (settings.visibility.time && exif.time) bottomElements.push(exif.time);
    } else {
        if (settings.visibility.iso && exif.iso) bottomElements.push(exif.iso);
    }
    const bottomText = bottomElements.join(separator);

    if (bottomText) {
        const descFontSize = Math.floor(baseScale * 0.025); // 当初の比率に戻す
        ctx.font = getFontString(descFontSize, settings.fontFamily);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = settings.textColor;
        ctx.fillText(bottomText, canvas.width / 2, textY + (descFontSize * 0.8));
        ctx.globalAlpha = 1.0;
    }

}
