'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from './Icon';

export type SelectOption = {
  value: string;
  label: string;
};

type BaseProps = {
  className?: string;
  error?: string;
  helperText?: string;
  id: string;
  label?: string;
  onQueryChange?: (query: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
};

type SingleSelectProps = BaseProps & {
  multiple?: false;
  onChange: (value: string) => void;
  value: string;
};

type MultiSelectProps = BaseProps & {
  multiple: true;
  onChange: (value: string[]) => void;
  value: string[];
};

type SearchableSelectProps = SingleSelectProps | MultiSelectProps;

export function SearchableSelect(props: SearchableSelectProps) {
  const { className = '', error, helperText, id, label, onQueryChange, options, placeholder = 'Search...', required } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedValues = props.multiple ? props.value : props.value ? [props.value] : [];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const singleSelected = props.multiple ? undefined : options.find((option) => option.value === props.value);

  const filteredOptions = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commitSelection = (option: SelectOption) => {
    if (props.multiple) {
      const next = selectedValues.includes(option.value)
        ? selectedValues.filter((v) => v !== option.value)
        : [...selectedValues, option.value];
      props.onChange(next);
      setQuery('');
      return;
    }
    props.onChange(option.value);
    setIsOpen(false);
    setQuery('');
  };

  const removeValue = (value: string) => {
    if (props.multiple) props.onChange(selectedValues.filter((v) => v !== value));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) commitSelection(option);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {props.multiple && selectedOptions.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700"
            >
              {option.label}
              <button
                aria-label={`Remove ${option.label}`}
                className="text-teal-500 hover:text-teal-800"
                onClick={() => removeValue(option.value)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          aria-describedby={error || helperText ? `${id}-description` : undefined}
          aria-invalid={error ? true : undefined}
          className={`block w-full rounded-xl border bg-white py-2.5 px-3 text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 ${
            error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10'
          } ${!props.multiple && props.value ? 'pr-8' : ''} ${className}`}
          id={id}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
            onQueryChange?.(event.target.value);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={isOpen ? query : props.multiple ? '' : (singleSelected?.label ?? '')}
        />
        {!props.multiple && props.value && !isOpen && (
          <button
            aria-label="Clear selection"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            onClick={() => props.onChange('')}
            type="button"
          >
            ×
          </button>
        )}
      </div>
      {isOpen && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {filteredOptions.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No results</li>
          )}
          {filteredOptions.map((option, index) => {
            const isSelected = selectedValues.includes(option.value);
            return (
              <li
                className={`flex items-center justify-between gap-2 cursor-pointer px-3 py-2 text-sm ${
                  index === activeIndex ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
                key={option.value}
                onClick={() => commitSelection(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{option.label}</span>
                {isSelected && <Icon name="check" className="h-4 w-4 shrink-0 text-teal-600" />}
              </li>
            );
          })}
        </ul>
      )}
      {(error || helperText) && (
        <p className={`mt-1.5 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`} id={`${id}-description`}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
