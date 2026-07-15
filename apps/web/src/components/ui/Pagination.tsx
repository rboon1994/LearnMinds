import { Icon } from './Icon';

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

// Always keeps the first/last page and up to one neighbour on each side of the current page
// visible, collapsing any larger gap into a single "…" — e.g. page 1 of 10 → 1 2 … 10,
// page 5 of 10 → 1 … 4 5 6 … 10.
function getPageItems(current: number, totalPages: number): (number | 'ellipsis')[] {
  const boundary = new Set<number>([1, totalPages]);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i > 1 && i < totalPages) boundary.add(i);
  }
  const sorted = Array.from(boundary).sort((a, b) => a - b);

  const items: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) items.push('ellipsis');
    items.push(n);
    prev = n;
  }
  return items;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{start}</span> to{' '}
        <span className="font-medium text-slate-700">{end}</span> of{' '}
        <span className="font-medium text-slate-700">{total.toLocaleString()}</span> results
      </p>
      <div className="flex items-center gap-1.5">
        <button
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-400"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          <Icon className="h-4 w-4" name="arrow-left" />
        </button>
        {getPageItems(page, totalPages).map((item, index) =>
          item === 'ellipsis' ? (
            <span className="flex h-8 w-8 items-center justify-center text-sm text-slate-400" key={`ellipsis-${index}`}>
              …
            </span>
          ) : (
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                item === page
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
              key={item}
              onClick={() => onPageChange(item)}
              type="button"
            >
              {item}
            </button>
          ),
        )}
        <button
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-400"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          <Icon className="h-4 w-4 rotate-180" name="arrow-left" />
        </button>
      </div>
    </div>
  );
}
