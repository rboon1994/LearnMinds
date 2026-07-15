import type { ReactNode } from 'react';

import { Pagination } from './Pagination';

export type AdminTableColumn<T> = {
  className?: string;
  header: string;
  hidden?: boolean;
  render: (row: T) => ReactNode;
};

type AdminTablePagination = {
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  total: number;
};

type AdminTableProps<T> = {
  columns: AdminTableColumn<T>[];
  data: T[];
  emptyMessage: string;
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  pagination?: AdminTablePagination;
  toolbar?: ReactNode;
};

export function AdminTable<T>({
  columns,
  data,
  emptyMessage,
  keyField,
  onRowClick,
  pagination,
  toolbar,
}: AdminTableProps<T>) {
  const visibleColumns = columns.filter((column) => !column.hidden);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {toolbar && (
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:flex-wrap">
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              {visibleColumns.map((column, index) => (
                <th
                  key={column.header}
                  className={`px-4 py-3 text-left border-b border-slate-200 ${
                    index === 0 && onRowClick ? 'border-l-2 border-l-transparent' : ''
                  } ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row) => (
              <tr
                key={String(row[keyField])}
                className={`group hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {visibleColumns.map((column, index) => (
                  <td
                    key={column.header}
                    className={`px-4 py-3 text-slate-500 ${
                      index === 0 && onRowClick ? 'border-l-2 border-transparent group-hover:border-black' : ''
                    } ${column.className ?? ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination && (
        <div className="border-t border-slate-200 p-4">
          <Pagination
            onPageChange={pagination.onPageChange}
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
          />
        </div>
      )}
    </div>
  );
}
