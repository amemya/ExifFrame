import { ChangeEvent, FocusEvent, MouseEvent, useState } from 'react';

const EyeIcon = ({ visible }: { visible: boolean }) => (
    visible ? (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    ) : (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
    )
);

export interface ToggleInputProps {
    label: string;
    id: string;
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    visible: boolean;
    onToggleVisibility: () => void;
    hideInput?: boolean;
    suggestions?: string[];
    onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
}

export const ToggleInput = ({ label, id, value, onChange, visible, onToggleVisibility, hideInput, suggestions, onBlur }: ToggleInputProps) => {
    // Temporary override to show all datalist options on click.
    // null = no override (use parent's value), "" = cleared for datalist display.
    const [tempValue, setTempValue] = useState<string | null>(null);
    const hasSuggestions = suggestions && suggestions.length > 0;

    const handleMouseDown = (e: MouseEvent<HTMLInputElement>) => {
        if (hasSuggestions && document.activeElement !== e.currentTarget) {
            setTempValue("");
        }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setTempValue(null);
        onChange(e);
    };

    const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
        if (tempValue !== null) {
            e.currentTarget.value = value;
        }
        if (onBlur) {
            onBlur(e);
        }
        setTempValue(null);
    };

    const displayValue = tempValue !== null ? tempValue : value;

    return (
        <div className="input-group">
            <div className="toggle-input-header">
                <label htmlFor={id} className="toggle-input-label">{label}</label>
                <button
                    type="button"
                    onClick={onToggleVisibility}
                    className={`toggle-visibility-btn ${visible ? 'visible' : ''}`}
                    title={visible ? `Hide ${label} from frame` : `Show ${label} on frame`}
                    aria-label={visible ? `Hide ${label} from frame` : `Show ${label} on frame`}
                    aria-pressed={visible}
                >
                    <EyeIcon visible={visible} />
                </button>
            </div>
            {!hideInput && (
                <>
                    <input
                        id={id}
                        type="text"
                        value={displayValue}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onMouseDown={handleMouseDown}
                        className={`toggle-input-field ${!visible ? 'hidden' : ''}`}
                        list={hasSuggestions ? `${id}-datalist` : undefined}
                    />
                    {hasSuggestions && (
                        <datalist id={`${id}-datalist`}>
                            {suggestions.map((s) => (
                                <option key={s} value={s} />
                            ))}
                        </datalist>
                    )}
                </>
            )}
        </div>
    );
};
