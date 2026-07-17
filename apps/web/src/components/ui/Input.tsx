import { forwardRef, useEffect } from 'react';
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

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className = '',
    error,
    helperText,
    id,
    label,
    leftIcon,
    required,
    rightElement,
    variant = 'default',
    ...props
  },
  ref,
) {
  const hasLeftIcon = Boolean(leftIcon);
  const hasRightElement = Boolean(rightElement);

  useEffect(() => {
    if (!error) return;
    const el = document.getElementById(id);
    if (!(el instanceof HTMLInputElement)) return;
    const firstInvalid = document.querySelector('[aria-invalid="true"]');
    if (firstInvalid === el) el.focus();
  }, [error, id]);

  if (variant === 'floating') {
    return (
      <div className="relative">
        <input
          aria-describedby={error || helperText ? `${id}-description` : undefined}
          aria-invalid={error ? true : undefined}
          className={`peer w-full rounded-xl border bg-slate-100/60 py-3.5 px-4 text-[15px] text-slate-900 transition-all duration-300 ease-out outline-none placeholder:text-transparent focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10 hover:bg-slate-100/90 hover:border-slate-300 [&:-webkit-autofill]:shadow-[0_0_0_30px_rgb(241_245_249)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a] ${
            error ? 'border-red-300 focus:ring-red-500' : 'border-slate-200/80'
          } ${hasLeftIcon ? 'pl-10' : ''} ${hasRightElement ? 'pr-12' : ''} ${className}`}
          id={id}
          placeholder=" "
          ref={ref}
          required={required}
          {...props}
        />
        {label && (
          <label
            htmlFor={id}
            className={`pointer-events-none absolute left-4 top-3.5 text-slate-400 text-[15px] transition-all duration-200 ease-out px-1
              peer-focus:-top-2 peer-focus:left-3 peer-focus:text-xs peer-focus:text-blue-600
              peer-focus:bg-white peer-focus:font-medium
              peer-not-placeholder-shown:-top-2 peer-not-placeholder-shown:left-3
              peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:bg-white
              peer-not-placeholder-shown:font-medium
              peer-[:-webkit-autofill]:-top-2 peer-[:-webkit-autofill]:left-3
              peer-[:-webkit-autofill]:text-xs peer-[:-webkit-autofill]:bg-slate-100
              peer-[:-webkit-autofill]:font-medium
              ${error ? 'text-red-500 peer-focus:text-red-500' : ''}
              ${hasLeftIcon ? 'left-10' : ''}
            `}
          >
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
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
          {required && <span className="ml-0.5 text-red-500">*</span>}
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
          className={`block w-full rounded-xl border bg-white py-2.5 text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 ${
            error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10'
          } ${hasLeftIcon ? 'pl-10' : 'pl-3'} ${hasRightElement ? 'pr-10' : 'pr-3'} ${className}`}
          id={id}
          ref={ref}
          required={required}
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
});
