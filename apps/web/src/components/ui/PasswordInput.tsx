'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';

import { Icon } from './Icon';
import { Input } from './Input';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  error?: string;
  helperText?: string;
  id: string;
  label?: string;
  leftIcon?: ReactNode;
  variant?: 'default' | 'floating';
  showStrength?: boolean;
  onStrengthChange?: (strength: number) => void;
};

export function PasswordInput({
  id,
  label,
  leftIcon,
  variant = 'default',
  showStrength = false,
  onStrengthChange,
  onChange,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [strength, setStrength] = useState(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Calculate password strength
    let newStrength = 0;
    if (value.length >= 8) newStrength++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) newStrength++;
    if (/\d/.test(value)) newStrength++;
    if (/[^a-zA-Z0-9]/.test(value)) newStrength++;

    setStrength(newStrength);
    onStrengthChange?.(newStrength);

    if (onChange) {
      onChange(e);
    }
  };

  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div>
      <Input
        id={id}
        label={label}
        leftIcon={leftIcon}
        rightElement={
          <button
            aria-label={isVisible ? `Hide ${label ?? 'password'}` : `Show ${label ?? 'password'}`}
            className="text-slate-400 transition-colors hover:text-slate-600"
            onClick={() => setIsVisible((current) => !current)}
            type="button"
          >
            <Icon className="h-5 w-5" name={isVisible ? 'eye-off' : 'eye'} />
          </button>
        }
        type={isVisible ? 'text' : 'password'}
        variant={variant}
        onChange={handleChange}
        {...props}
      />
      {showStrength && (
        <div className="mt-2">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: index < strength ? strengthColors[strength - 1] : '#e2e8f0',
                }}
              />
            ))}
          </div>
          {props.value && (
            <p className={`text-xs mt-1.5 font-medium ${
              strength === 0 ? 'text-red-500' :
              strength === 1 ? 'text-orange-500' :
              strength === 2 ? 'text-yellow-600' : 'text-green-500'
            }`}>
              {strengthLabels[strength - 1] || 'Weak'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}