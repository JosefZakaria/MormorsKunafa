import { useLayoutEffect, useRef, useState, type ClipboardEvent, type MouseEvent } from 'react';
import { Bold, Heading3, Italic } from 'lucide-react';
import { prepareDescriptionHtml, sanitizeDescriptionHtml } from '../../../utils/productDescriptionHtml';

function runCommand(command: string, value?: string) {
    document.execCommand(command, false, value);
}

export function DescriptionEditor({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (html: string) => void;
    disabled?: boolean;
}) {
    const editorRef = useRef<HTMLDivElement>(null);
    const initialHtml = useRef(prepareDescriptionHtml(value));
    const [active, setActive] = useState({ bold: false, italic: false, heading: false });

    useLayoutEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        el.innerHTML = initialHtml.current;
        try {
            document.execCommand('defaultParagraphSeparator', false, 'p');
        } catch {
            /* ignore */
        }
    }, []);

    const syncActive = () => {
        try {
            setActive({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                heading: document.queryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '') === 'h3',
            });
        } catch {
            /* ignore */
        }
    };

    const emit = () => {
        onChange(sanitizeDescriptionHtml(editorRef.current?.innerHTML ?? ''));
        syncActive();
    };

    const apply = (command: string, arg?: string) => (event: MouseEvent) => {
        event.preventDefault();
        if (disabled) return;
        editorRef.current?.focus();
        if (command === 'heading') {
            const current = document.queryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '');
            runCommand('formatBlock', current === 'h3' ? 'p' : 'h3');
        } else {
            runCommand(command, arg);
        }
        emit();
    };

    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const html = event.clipboardData.getData('text/html');
        const plain = event.clipboardData.getData('text/plain');
        const incoming = html
            ? prepareDescriptionHtml(html)
            : prepareDescriptionHtml(plain.replace(/\r\n|\n|\r/g, '<br>'));
        runCommand('insertHTML', incoming || ' ');
        emit();
    };

    return (
        <div className="admin-desc-editor">
            <div className="admin-desc-editor__toolbar" role="toolbar" aria-label="Textformat">
                <button
                    type="button"
                    className={active.bold ? 'is-active' : ''}
                    onMouseDown={apply('bold')}
                    disabled={disabled}
                    title="Fet"
                >
                    <Bold size={16} />
                    Fet
                </button>
                <button
                    type="button"
                    className={active.italic ? 'is-active' : ''}
                    onMouseDown={apply('italic')}
                    disabled={disabled}
                    title="Kursiv"
                >
                    <Italic size={16} />
                    Kursiv
                </button>
                <button
                    type="button"
                    className={active.heading ? 'is-active' : ''}
                    onMouseDown={apply('heading')}
                    disabled={disabled}
                    title="Rubrik"
                >
                    <Heading3 size={16} />
                    Rubrik
                </button>
            </div>
            <div
                ref={editorRef}
                id="admin-product-desc"
                className="admin-desc-editor__body"
                contentEditable={!disabled}
                role="textbox"
                aria-multiline="true"
                aria-label="Beskrivning"
                data-placeholder="Skriv texten som kunden ska se…"
                onInput={emit}
                onKeyUp={syncActive}
                onMouseUp={syncActive}
                onFocus={syncActive}
                onPaste={handlePaste}
                suppressContentEditableWarning
            />
        </div>
    );
}
