import type { TextareaHTMLAttributes } from 'react';

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  error?: string;
  helperText?: string;
  id: string;
  label?: string;
};

export function Textarea({ className = '', error, helperText, id, label, ...props }: TextareaProps) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        aria-describedby={error || helperText ? `${id}-description` : undefined}
        aria-invalid={error ? true : undefined}
        className={`block w-full rounded-xl border bg-white py-2.5 px-3 text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 ${
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10'
        } ${className}`}
        id={id}
        {...props}
      />
      {(error || helperText) && (
        <p className={`mt-1.5 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`} id={`${id}-description`}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
