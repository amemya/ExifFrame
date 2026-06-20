import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Events } from '@wailsio/runtime';
// @ts-expect-error generated bindings
import { App as AppAPI, Settings } from '../../bindings/ExifFrame/index';
import { MetadataVisibility, toVisibility, applyVisibility, ExifData } from '../types';

export interface UseSettingsSyncProps {
    setExif: React.Dispatch<React.SetStateAction<ExifData>>;
    showToast: (msg: string, isError?: boolean) => void;
}

export function useSettingsSync({
    setExif,
    showToast
}: UseSettingsSyncProps) {
    const [watchFolder, setWatchFolder] = useState("");
    const [exportFolder, setExportFolder] = useState("");
    const [profile, setProfile] = useState<string>("digital");

    const [visibility, setVisibility] = useState<MetadataVisibility>({
        camera: true, lens: true, focalLength: true, aperture: true,
        shutterSpeed: true, iso: true, film: true, developer: true,
        dilution: true, temperature: true, time: true
    });

    const [aspectRatioPreset, setAspectRatioPreset] = useState<string>("4300:3618");
    const [customRatioW, setCustomRatioW] = useState<number>(4300);
    const [customRatioH, setCustomRatioH] = useState<number>(3618);
    const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
    const [alignment, setAlignment] = useState<"top" | "center">("top");
    const [showPipeSeparator, setShowPipeSeparator] = useState<boolean>(true);
    const [globalFrameColor, setGlobalFrameColor] = useState<string>("#ffffff");
    const [globalTextColor, setGlobalTextColor] = useState<string>("#000000");
    const [globalJpegQuality, setGlobalJpegQuality] = useState<string>("auto");

    const isInitialLoad = useRef(true);
    // setExif depends on `selectedIndex` in useImageManager, meaning it is recreated on every selection change.
    // To prevent the settings fetch `useEffect` from re-running (and resetting user input) on every selection,
    // we use a ref to safely access the latest setExif function without adding it to the dependency array.
    const setExifRef = useRef(setExif);
    useLayoutEffect(() => {
        setExifRef.current = setExif;
    }, [setExif]);

    useEffect(() => {
        AppAPI.GetSettings().then((s: Settings) => {
            if (s.watchFolder) setWatchFolder(s.watchFolder);
            if (s.exportFolder) setExportFolder(s.exportFolder);
            if (s.aspectRatioPreset) setAspectRatioPreset(s.aspectRatioPreset);
            if (s.customRatioW) setCustomRatioW(s.customRatioW);
            if (s.customRatioH) setCustomRatioH(s.customRatioH);
            if (s.orientation && ['landscape', 'portrait'].includes(s.orientation)) {
                setOrientation(s.orientation as "landscape" | "portrait");
            }
            if (s.alignment && ['top', 'center'].includes(s.alignment)) {
                setAlignment(s.alignment as "top" | "center");
            }
            if (s.showPipeSeparator !== undefined) setShowPipeSeparator(s.showPipeSeparator);
            if (s.frameColor) setGlobalFrameColor(s.frameColor);
            if (s.textColor) setGlobalTextColor(s.textColor);
            if (s.jpegQuality) setGlobalJpegQuality(s.jpegQuality);
            else setGlobalJpegQuality("auto");
            if (s.profile) {
                setProfile(['digital', 'film'].includes(s.profile) ? s.profile : 'digital');
            }

            setExifRef.current((prev: ExifData) => ({
                ...prev,
                film: s.film || "",
                developer: s.developer || "",
                dilution: s.dilution || "",
                temperature: s.temperature || "",
                time: s.time || ""
            }));

            setVisibility(toVisibility(s));
        }).catch((err: any) => {
            console.error("Failed to load settings:", err);
        }).finally(() => {
            isInitialLoad.current = false;
        });

        const unsubSettings = Events.On("settings_saved", () => {
            // Intentionally only update global auto-export settings (watchFolder, exportFolder, jpegQuality).
            // Do not update profile or colors here to avoid unexpectedly overwriting 
            // the user's ongoing manual edits in the main window.
            AppAPI.GetSettings().then((s: Settings) => {
                if (s.watchFolder) setWatchFolder(s.watchFolder);
                else setWatchFolder("");
                if (s.exportFolder) setExportFolder(s.exportFolder);
                else setExportFolder("");
                if (s.jpegQuality) setGlobalJpegQuality(s.jpegQuality);
                else setGlobalJpegQuality("auto");
            }).catch((err: any) => {
                console.error("Failed to reload settings:", err);
            });
        });

        return () => {
            unsubSettings();
        };
    }, []);

    const handleSaveAutoExportDefault = useCallback(async (currentExif: ExifData, currentFrameColor: string, currentTextColor: string, currentOrientation: "landscape" | "portrait") => {
        const s = new Settings();
        s.watchFolder = watchFolder;
        s.exportFolder = exportFolder;
        s.aspectRatioPreset = aspectRatioPreset;
        s.customRatioW = customRatioW;
        s.customRatioH = customRatioH;
        s.orientation = currentOrientation;
        s.alignment = alignment;
        s.showPipeSeparator = showPipeSeparator;
        s.profile = profile;
        s.frameColor = currentFrameColor;
        s.textColor = currentTextColor;

        try {
            const currentSettings = await AppAPI.GetSettings();
            s.overrideExif = currentSettings.overrideExif;
        } catch (e) {
            s.overrideExif = false;
        }
        s.jpegQuality = globalJpegQuality;

        const exif = currentExif;
        s.camera = exif.camera;
        s.lens = exif.lens;
        s.focalLength = exif.focalLength;
        s.aperture = exif.aperture;
        s.shutterSpeed = exif.shutterSpeed;
        s.iso = exif.iso;
        s.film = exif.film;
        s.developer = exif.developer;
        s.dilution = exif.dilution;
        s.temperature = exif.temperature;
        s.time = exif.time;

        applyVisibility(s, visibility);

        try {
            const errStr = await AppAPI.SaveSettings(s);
            if (errStr && errStr !== "") {
                showToast(errStr, true);
            } else {
                showToast("Auto-export default saved");
            }
        } catch (e: any) {
            console.error("Failed to save auto-export default settings:", e);
            showToast("Error saving settings", true);
        }
    }, [
        watchFolder, exportFolder, aspectRatioPreset, customRatioW, customRatioH,
        alignment, showPipeSeparator, profile, globalJpegQuality, visibility, showToast
    ]);

    return {
        watchFolder, setWatchFolder,
        exportFolder, setExportFolder,
        profile, setProfile,
        visibility, setVisibility,
        aspectRatioPreset, setAspectRatioPreset,
        customRatioW, setCustomRatioW,
        customRatioH, setCustomRatioH,
        orientation, setOrientation,
        alignment, setAlignment,
        showPipeSeparator, setShowPipeSeparator,
        globalFrameColor, setGlobalFrameColor,
        globalTextColor, setGlobalTextColor,
        globalJpegQuality, setGlobalJpegQuality,
        handleSaveAutoExportDefault,
        isInitialLoad
    };
}
