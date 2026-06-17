import { useState, useRef, useEffect, useCallback } from 'react';

const TOAST_DURATION_MS = 3000;

export interface UseToastReturn {
    show: (message: string, isError?: boolean) => void;
    element: React.ReactNode;
}

export function useToast(): UseToastReturn {
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [toastIsError, setToastIsError] = useState(false);
    const toastTimerRef = useRef<number | null>(null);
    const toastRafRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
            }
            if (toastRafRef.current !== null) {
                window.cancelAnimationFrame(toastRafRef.current);
            }
        };
    }, []);

    const show = useCallback((message: string, isError: boolean = false) => {
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
        }
        if (toastRafRef.current !== null) {
            window.cancelAnimationFrame(toastRafRef.current);
            toastRafRef.current = null;
        }

        // Force a re-render by clearing the state first
        setToastMessage(null);
        toastRafRef.current = requestAnimationFrame(() => {
            setToastIsError(isError);
            setToastMessage(message);
            toastTimerRef.current = window.setTimeout(() => {
                setToastMessage(null);
                toastTimerRef.current = null;
            }, TOAST_DURATION_MS);
            toastRafRef.current = null;
        });
    }, []);

    const element = toastMessage ? (
        <div className="toast-container" aria-live={toastIsError ? 'assertive' : 'polite'} aria-atomic="true" role={toastIsError ? 'alert' : 'status'}>
            <div className={`toast ${toastIsError ? 'error' : 'success'}`} style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}>{toastMessage}</div>
        </div>
    ) : null;

    return { show, element };
}
