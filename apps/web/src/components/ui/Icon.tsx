import type { SVGProps } from 'react';

export type IconName =
  | 'bolt'
  | 'check'
  | 'check-circle'
  | 'email'
  | 'error'
  | 'eye'
  | 'eye-off'
  | 'info'
  | 'lock'
  | 'search'
  | 'shield'
  | 'warning'
  | 'x'
  | 'user';

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

const paths: Record<IconName, string[]> = {
  bolt: ['M13 10V3L4 14h7v7l9-11h-7z'],
  check: ['M5 13l4 4L19 7'],
  'check-circle': ['M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'],
  email: [
    'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  ],
  error: ['M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  info: ['M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  eye: [
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  ],
  'eye-off': [
    'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21',
  ],
  lock: [
    'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  ],
  search: ['M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'],
  shield: [
    'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  ],
  warning: ['M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'],
  x: ['M6 18L18 6M6 6l12 12'],
  user: ['M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'],
};

export function Icon({ name, className = 'h-5 w-5', ...props }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      {paths[name].map((path) => (
        <path key={path} d={path} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      ))}
    </svg>
  );
}
