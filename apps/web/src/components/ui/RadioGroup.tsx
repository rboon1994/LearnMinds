export type RadioOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type RadioGroupProps = {
  className?: string;
  error?: string;
  helperText?: string;
  label?: string;
  name: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  value: string;
};

export function RadioGroup({
  className = '',
  error,
  helperText,
  label,
  name,
  onChange,
  options,
  value,
}: RadioGroupProps) {
  const labelId = label ? `${name}-label` : undefined;
  const descriptionId = error || helperText ? `${name}-description` : undefined;

  return (
    <div>
      {label && (
        <div className="mb-1.5 block text-sm font-medium text-slate-700" id={labelId}>
          {label}
        </div>
      )}

      <div
        aria-describedby={descriptionId}
        aria-labelledby={labelId}
        className={`flex flex-wrap gap-2 ${className}`}
        role="radiogroup"
      >
        {options.map((option) => (
          <label
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all has-focus-visible:ring-2 has-focus-visible:ring-teal-400 has-focus-visible:ring-offset-2 ${
              value === option.value
                ? 'bg-white text-teal-600 shadow-sm border border-teal-600 font-bold'
                : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-100 focus:ring-slate-500'
            } ${option.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="sr-only"
              disabled={option.disabled}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </div>

      {(error || helperText) && (
        <p className={`mt-1.5 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`} id={descriptionId}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
