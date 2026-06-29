import type { ReactNode } from 'react';

import { Icon } from './Icon';
import type { IconName } from './Icon';

type AlertType = 'error' | 'success' | 'warning' | 'info';

type AlertProps = {
  type: AlertType;
  title?: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
};

const config: Record<AlertType, {
  accent: string;
  glass: string;
  iconWrap: string;
  iconName: IconName;
  titleColor: string;
  bodyColor: string;
}> = {
  error: {
    accent:    'from-rose-500 to-red-500',
    glass:     'bg-rose-50/70 border-rose-200/60',
    iconWrap:  'bg-gradient-to-br from-rose-500 to-red-500',
    iconName:  'error',
    titleColor:'text-rose-900',
    bodyColor: 'text-rose-700',
  },
  success: {
    accent:    'from-green-400 to-teal-500',
    glass:     'bg-emerald-50/70 border-emerald-200/60',
    iconWrap:  'bg-gradient-to-br from-green-400 to-teal-500',
    iconName:  'check-circle',
    titleColor:'text-emerald-900',
    bodyColor: 'text-emerald-700',
  },
  warning: {
    accent:    'from-amber-400 to-orange-400',
    glass:     'bg-amber-50/70 border-amber-200/60',
    iconWrap:  'bg-gradient-to-br from-amber-400 to-orange-400',
    iconName:  'warning',
    titleColor:'text-amber-900',
    bodyColor: 'text-amber-700',
  },
  info: {
    accent:    'from-sky-400 to-blue-500',
    glass:     'bg-sky-50/70 border-sky-200/60',
    iconWrap:  'bg-gradient-to-br from-sky-400 to-blue-500',
    iconName:  'info',
    titleColor:'text-sky-900',
    bodyColor: 'text-sky-700',
  },
};

export function Alert({ type, title, children, className = '', icon }: AlertProps) {
  const c = config[type];

  return (
    <div className={`relative flex gap-3 overflow-hidden rounded-xl border backdrop-blur-sm px-4 py-3.5 ${c.glass} ${className}`}>
      {/* gradient left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-linear-to-b ${c.accent}`} />

      {/* icon badge */}
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${c.iconWrap}`}>
        {icon ?? <Icon name={c.iconName} className="h-3.5 w-3.5" />}
      </div>

      {/* content */}
      <div className="min-w-0 flex-1">
        {title && <p className={`text-sm font-semibold mb-0.5 ${c.titleColor}`}>{title}</p>}
        <p className={`text-sm leading-relaxed ${c.bodyColor}`}>{children}</p>
      </div>
    </div>
  );
}
