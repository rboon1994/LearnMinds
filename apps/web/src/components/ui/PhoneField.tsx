'use client';

import { useState } from 'react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';

type PhoneFieldProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (phone: string, dialCode: string) => void;
  required?: boolean;
  error?: string;
  defaultCountry?: string;
  variant?: 'default' | 'floating';
};

export function PhoneField({
  id = 'phone',
  label = 'Phone Number',
  value,
  onChange,
  required,
  error,
  defaultCountry = 'my',
  variant = 'floating',
}: PhoneFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  if (variant === 'floating') {
    // Label floats when focused OR when a value has been entered.
    // Since the country flag button is always visible, the field is never visually
    // "empty" — so the label is always floated once the user interacts.
    const isFloated = isFocused || Boolean(value);

    return (
      <div className="relative">
        <div
          className={`flex w-full rounded-xl border transition-all duration-300 ease-out ${
            isFocused
              ? 'bg-white border-teal-400 ring-4 ring-teal-400/10'
              : error
                ? 'bg-slate-100/60 border-red-300'
                : 'bg-slate-100/60 border-slate-200/80 hover:bg-slate-100/90 hover:border-slate-300'
          }`}
        >
          <PhoneInput
            inputProps={{ id, 'aria-invalid': error ? true : undefined }}
            defaultCountry={defaultCountry}
            value={value}
            onChange={(phone, meta) => onChange(phone, meta.country.dialCode)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={{ width: '100%' }}
            inputStyle={{
              width: '100%',
              height: '52px',
              fontSize: '15px',
              border: 'none',
              borderRadius: '0 12px 12px 0',
              backgroundColor: 'transparent',
              color: '#0f172a',
              outline: 'none',
              paddingLeft: '12px',
              paddingRight: '16px',
            }}
            countrySelectorStyleProps={{
              buttonStyle: {
                height: '52px',
                border: 'none',
                borderRight: '1px solid #e2e8f0',
                borderRadius: '12px 0 0 12px',
                backgroundColor: 'transparent',
                padding: '0 10px 0 14px',
              },
            }}
          />
        </div>

        {/* Floating label — always floated since the country flag is always visible */}
        <label
          htmlFor={id}
          className={`pointer-events-none absolute px-1 transition-all duration-200 ease-out ${
            isFloated
              ? '-top-2 left-3 text-xs bg-white font-medium ' + (error ? 'text-red-500' : isFocused ? 'text-blue-600' : 'text-slate-500')
              : 'top-3.5 left-22.5 text-[15px] text-slate-400'
          }`}
        >
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>

        {error && (
          <p className="mt-1.5 text-sm text-red-600" id={`${id}-description`}>{error}</p>
        )}
      </div>
    );
  }

  // default variant — label above, matches Input default
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div
        className={`flex w-full rounded-xl border transition-all ${
          error ? 'border-red-300' : 'border-slate-300'
        } bg-white focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-400/10`}
      >
        <PhoneInput
          inputProps={{ id }}
          defaultCountry={defaultCountry}
          value={value}
          onChange={(phone, meta) => onChange(phone, meta.country.dialCode)}
          style={{ width: '100%' }}
          inputStyle={{
            width: '100%',
            height: '44px',
            fontSize: '15px',
            border: 'none',
            borderRadius: '0 12px 12px 0',
            backgroundColor: 'transparent',
            color: '#0f172a',
            outline: 'none',
            paddingLeft: '12px',
          }}
          countrySelectorStyleProps={{
            buttonStyle: {
              height: '44px',
              border: 'none',
              borderRight: '1px solid #e2e8f0',
              borderRadius: '12px 0 0 12px',
              backgroundColor: 'transparent',
              padding: '0 10px 0 12px',
            },
          }}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-red-600" id={`${id}-description`}>{error}</p>
      )}
    </div>
  );
}
