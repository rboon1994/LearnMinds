import type { InputHTMLAttributes, ReactNode } from 'react';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  error?: string;
  helperText?: string;
  id: string;
  label?: string;
  leftIcon?: ReactNode;
  rightElement?: ReactNode;
  variant?: 'default' | 'floating';
};

export function Input({
  className = '',
  error,
  helperText,
  id,
  label,
  leftIcon,
  rightElement,
  variant = 'default',
  ...props
}: InputProps) {
  const hasLeftIcon = Boolean(leftIcon);
  const hasRightElement = Boolean(rightElement);

  if (variant === 'floating') {
    return (
      <div className="relative">
        <input
          aria-describedby={error || helperText ? `${id}-description` : undefined}
          aria-invalid={error ? true : undefined}
          className={`peer w-full rounded-xl border bg-slate-100/60 py-[14px] px-4 text-[15px] text-slate-900 transition-all duration-300 ease-out outline-none placeholder:text-transparent focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10 hover:bg-slate-100/90 hover:border-slate-300 ${
            error ? 'border-red-300 focus:ring-red-500' : 'border-slate-200/80'
          } ${hasLeftIcon ? 'pl-10' : ''} ${hasRightElement ? 'pr-12' : ''} ${className}`}
          id={id}
          placeholder=" "
          {...props}
        />
        {label && (
          <label
            htmlFor={id}
            className={`pointer-events-none absolute left-4 top-[14px] text-slate-400 text-[15px] transition-all duration-200 ease-out px-1
              peer-focus:-top-2 peer-focus:left-3 peer-focus:text-xs peer-focus:text-blue-600
              peer-focus:bg-white peer-focus:font-medium
              peer-not-placeholder-shown:-top-2 peer-not-placeholder-shown:left-3
              peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:bg-white
              peer-not-placeholder-shown:font-medium
              ${error ? 'text-red-500 peer-focus:text-red-500' : ''}
              ${hasLeftIcon ? 'left-10' : ''}
            `}
          >
            {label}
          </label>
        )}
        {rightElement && <div className="absolute inset-y-0 right-0 flex items-center pr-4">{rightElement}</div>}
        {(error || helperText) && (
          <p className={`mt-1.5 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`} id={`${id}-description`}>
            {error ?? helperText}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            {leftIcon}
          </div>
        )}
        <input
          aria-describedby={error || helperText ? `${id}-description` : undefined}
          aria-invalid={error ? true : undefined}
          className={`block w-full rounded-xl border bg-white py-2.5 text-slate-900 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 ${
            error ? 'border-red-300 focus:ring-red-500' : 'border-slate-300 focus:ring-indigo-500'
          } ${hasLeftIcon ? 'pl-10' : 'pl-3'} ${hasRightElement ? 'pr-10' : 'pr-3'} ${className}`}
          id={id}
          {...props}
        />
        {rightElement && <div className="absolute inset-y-0 right-0 flex items-center pr-3">{rightElement}</div>}
      </div>
      {(error || helperText) && (
        <p className={`mt-1.5 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`} id={`${id}-description`}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}