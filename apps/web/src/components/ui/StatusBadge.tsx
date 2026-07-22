type StatusBadgeProps = {
  status: 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SYNCED' | 'FAILED';
  onClick?: () => void;
};

const VARIANTS = {
  on: 'border-teal-600 bg-white font-bold text-teal-600 shadow-sm hover:text-teal-800 hover:border-teal-800',
  off: 'border-slate-300 font-medium text-slate-500 hover:text-slate-700 hover:border-slate-700',
  pending: 'border-amber-500 font-medium text-amber-600',
  failed: 'border-red-500 font-medium text-red-600',
} as const;

const DOT = {
  on: 'bg-green-600',
  off: 'bg-slate-500',
  pending: 'bg-amber-500',
  failed: 'bg-red-500',
} as const;

function variantFor(status: StatusBadgeProps['status']): keyof typeof VARIANTS {
  if (status === 'PUBLISHED' || status === 'ACTIVE' || status === 'SYNCED') return 'on';
  if (status === 'PENDING') return 'pending';
  if (status === 'FAILED') return 'failed';
  return 'off';
}

export function StatusBadge({ status, onClick }: StatusBadgeProps) {
  const variant = variantFor(status);

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
        onClick ? '' : 'cursor-default'
      } ${VARIANTS[variant]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[variant]}`} />
      {status}
    </button>
  );
}
