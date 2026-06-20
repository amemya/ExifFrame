import { useState, useEffect } from 'react';
import { Events } from '@wailsio/runtime';
// @ts-expect-error generated bindings
import { App as AppAPI, UpdateStatus } from '../../bindings/ExifFrame/index';

export type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'restarting' | 'error';

export interface UpdateState {
    stage: UpdateStage;
    version: string;
    releaseNotes: string;
    downloadPct: number;
    errorMessage: string;
}

export function useUpdater() {
    const [updateState, setUpdateState] = useState<UpdateState>({
        stage: 'idle', version: '', releaseNotes: '', downloadPct: 0, errorMessage: ''
    });

    useEffect(() => {
        setUpdateState(prev => ({ ...prev, stage: 'checking' }));
        AppAPI.CheckForUpdate().then((status: UpdateStatus) => {
            if (status && status.state === 'available') {
                setUpdateState(prev => ({
                    ...prev,
                    stage: 'available',
                    version: status.version || '',
                    releaseNotes: status.releaseNotes || ''
                }));
            } else if (status && status.state === 'error') {
                setUpdateState(prev => ({ ...prev, stage: 'error', errorMessage: status.errorMessage || 'Update check failed' }));
            } else {
                setUpdateState(prev => ({ ...prev, stage: 'idle' }));
            }
        }).catch((err: Error) => {
            console.error("Update check failed:", err);
            setUpdateState(prev => ({ ...prev, stage: 'error', errorMessage: err.message }));
        });

        const offProgress = Events.On('wails:updater:download-progress', (e: any) => {
            const data = Array.isArray(e?.data) ? e.data[0] : e?.data;
            if (data && data.total > 0) {
                const pct = Math.round(((data.written || 0) / data.total) * 100);
                setUpdateState(prev => {
                    if (prev.stage === 'verifying' || prev.stage === 'installing' || prev.stage === 'ready' || prev.stage === 'restarting') {
                        return prev;
                    }
                    return { ...prev, stage: 'downloading', downloadPct: pct };
                });
            }
        });
        const offReady = Events.On('wails:updater:update-ready', () => {
            setUpdateState(prev => ({ ...prev, stage: 'ready' }));
        });
        const offError = Events.On('wails:updater:error', (e: any) => {
            const data = Array.isArray(e?.data) ? e.data[0] : e?.data;
            setUpdateState(prev => ({
                ...prev,
                stage: 'error',
                errorMessage: data?.message || 'Update failed'
            }));
        });
        const offVerifying = Events.On('wails:updater:verifying', () => {
            setUpdateState(prev => ({ ...prev, stage: 'verifying' }));
        });
        const offInstalling = Events.On('wails:updater:installing', () => {
            setUpdateState(prev => ({ ...prev, stage: 'installing' }));
        });

        return () => {
            offProgress();
            offReady();
            offError();
            offVerifying();
            offInstalling();
        };
    }, []);

    const triggerUpdate = () => {
        setUpdateState(prev => ({ ...prev, stage: 'downloading', downloadPct: 0 }));
        AppAPI.TriggerUpdate().then((status: UpdateStatus) => {
            if (status && status.state === 'error') {
                setUpdateState(prev => ({ ...prev, stage: 'error', errorMessage: status.errorMessage || 'Update failed' }));
            }
        }).catch((err: Error) => {
            console.error('Update failed:', err);
            setUpdateState(prev => ({ ...prev, stage: 'error', errorMessage: err.message }));
        });
    };

    const restartApp = () => {
        setUpdateState(prev => ({ ...prev, stage: 'restarting' }));
        AppAPI.RestartApp().then((status: UpdateStatus) => {
            if (status && status.state === 'error') {
                setUpdateState(prev => ({ ...prev, stage: 'error', errorMessage: status.errorMessage || 'Restart failed' }));
            }
        }).catch((err: Error) => {
            console.error('Restart failed:', err);
            setUpdateState(prev => ({ ...prev, stage: 'error', errorMessage: err.message }));
        });
    };

    return { updateState, setUpdateState, triggerUpdate, restartApp };
}
