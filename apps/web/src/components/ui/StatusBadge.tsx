type StatusBadgeProps = {
  status: 'DRAFT' | 'PUBLISHED';
  onClick?: () => void;
};

export function StatusBadge({ status, onClick }: StatusBadgeProps) {
  const isPublished = status === 'PUBLISHED';

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
        onClick ? '' : 'cursor-default'
      } ${
        isPublished
          ? 'border border-teal-600 bg-white font-bold text-teal-600 shadow-sm hover:text-teal-800 hover:border-teal-800'
          : 'border border-slate-300 font-medium text-slate-500 hover:text-slate-700 hover:border-slate-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? 'bg-green-600' : 'bg-slate-500'}`} />
      {status}
    </button>
  );
}
