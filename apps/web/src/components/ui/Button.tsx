import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gradient';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  loadingLabel?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  href?: string;
};

const baseClasses =
  'inline-flex items-center justify-center rounded-full font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-transparent bg-gradient-to-br from-green-400 to-sky-500 text-white shadow-sm hover:opacity-90 focus:ring-green-500',
  secondary: 'border border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 focus:ring-indigo-500',
  ghost: 'border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 focus:ring-indigo-500',
  gradient: 'relative overflow-hidden bg-gradient-to-r from-[#7ED957] via-[#4ECDC4] to-[#007BFF] bg-[length:200%_200%] text-white border border-transparent shadow-lg transition-all duration-300 animate-gradient hover:-translate-y-0.5 hover:shadow-xl hover:shadow-teal-500/25 focus:ring-teal-500',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
};

function LoadingSpinner() {
  return (
    <svg
      aria-hidden="true"
      className="mr-2 h-5 w-5 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Button({
  children,
  className = '',
  disabled,
  href,
  isLoading = false,
  leftIcon,
  loadingLabel,
  rightIcon,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  if (href) {
    return (
      <Link
        href={href}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {isLoading ? (
          <>
            <LoadingSpinner />
            {loadingLabel ?? children}
          </>
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </Link>
    );
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? (
        <>
          <LoadingSpinner />
          {loadingLabel ?? children}
        </>
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  );
}