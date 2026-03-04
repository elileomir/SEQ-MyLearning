import { useCallback } from "react";
import MDEditor from "@uiw/react-md-editor";

interface MarkdownEditorProps {
    value: string;
    onChange: (value: string) => void;
    height?: number;
    placeholder?: string;
}

/**
 * WYSIWYG Markdown editor wrapper around @uiw/react-md-editor.
 * Replaces the plain Textarea for slide content editing.
 * Features: toolbar (bold/italic/headers/lists/links/images), split preview, dark mode support.
 */
export default function MarkdownEditor({
    value,
    onChange,
    height = 350,
    placeholder,
}: MarkdownEditorProps) {
    const handleChange = useCallback(
        (val?: string) => {
            onChange(val || "");
        },
        [onChange]
    );

    return (
        <div data-color-mode="light">
            <MDEditor
                value={value}
                onChange={handleChange}
                height={height}
                preview="edit"
                textareaProps={{
                    placeholder: placeholder || "Write your content in Markdown...",
                }}
                visibleDragbar={false}
            />
        </div>
    );
}
