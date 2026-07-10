import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, InputHTMLAttributes } from 'react';

import { Icon } from './Icon';

type FileUploadProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'onChange'> & {
  error?: string;
  helperText?: string;
  id: string;
  label?: string;
  onFilesSelected?: (files: File[]) => void;
};

export function FileUpload({
  accept,
  className = '',
  error,
  helperText,
  id,
  label,
  multiple,
  onFilesSelected,
  ...props
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const matchesAccept = (file: File) => {
    if (!accept) return true;
    const patterns = accept.split(',').map((p) => p.trim().toLowerCase());
    return patterns.some((pattern) => {
      if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern);
      if (pattern.endsWith('/*')) return file.type.toLowerCase().startsWith(pattern.slice(0, -1));
      return file.type.toLowerCase() === pattern;
    });
  };

  const applyFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(matchesAccept);
    const selected = multiple ? files : files.slice(0, 1);
    if (selected.length === 0) return;
    setFileNames(selected.map((file) => file.name));
    onFilesSelected?.(selected);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    applyFiles(event.dataTransfer.files);
  };

  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor={id}>
          {label}
        </label>
      )}
      <div
        aria-describedby={error || helperText ? `${id}-description` : undefined}
        className={`cursor-pointer rounded-xl border border-dashed bg-white p-5 text-center transition-all ${
          error
            ? 'border-red-300'
            : isDragging
              ? 'border-teal-400 bg-teal-50/40'
              : 'border-slate-300 hover:border-teal-400'
        } ${className}`}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
      >
        <Icon className="mx-auto mb-2 h-5 w-5 text-slate-400" name="upload" />
        <div className="text-sm text-slate-700">
          {fileNames.length > 0 ? (
            fileNames.join(', ')
          ) : (
            <>
              Drop file or <span className="text-teal-600 underline">browse</span>
            </>
          )}
        </div>
        <input
          accept={accept}
          className="sr-only"
          id={id}
          multiple={multiple}
          onChange={handleChange}
          ref={inputRef}
          type="file"
          {...props}
        />
      </div>
      {(error || helperText) && (
        <p className={`mt-1.5 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`} id={`${id}-description`}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
