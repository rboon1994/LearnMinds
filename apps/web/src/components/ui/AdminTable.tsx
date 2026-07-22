import type { ReactNode } from 'react';
import { Reorder } from 'framer-motion';

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

type AdminTableReorder<T> = {
  // Fired continuously while dragging — update local state with the new order.
  onReorder: (data: T[]) => void;
  // Fired once when the drag finishes — persist the new order.
  onReorderEnd: (data: T[]) => void;
};

type AdminTableProps<T> = {
  columns: AdminTableColumn<T>[];
  data: T[];
  emptyMessage: string;
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  pagination?: AdminTablePagination;
  reorder?: AdminTableReorder<T>;
  toolbar?: ReactNode;
};

export function AdminTable<T>({
  columns,
  data,
  emptyMessage,
  keyField,
  onRowClick,
  pagination,
  reorder,
  toolbar,
}: AdminTableProps<T>) {
  const visibleColumns = columns.filter((column) => !column.hidden);

  const renderCells = (row: T) => (
    <>
      {reorder && (
        <td className="w-8 shrink-0 px-4 text-slate-300 cursor-grab active:cursor-grabbing select-none">⠿</td>
      )}
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
    </>
  );
  const rowClassName = `group hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`;

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
              {reorder && <th className="w-8 shrink-0 border-b border-slate-200" />}
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
          {reorder ? (
            <Reorder.Group
              as="tbody"
              axis="y"
              values={data}
              onReorder={reorder.onReorder}
              className="divide-y divide-slate-100"
            >
              {data.map((row) => (
                <Reorder.Item
                  key={String(row[keyField])}
                  as="tr"
                  value={row}
                  onDragEnd={() => reorder.onReorderEnd(data)}
                  className={rowClassName}
                >
                  {renderCells(row)}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            <tbody className="divide-y divide-slate-100">
              {data.map((row) => (
                <tr
                  key={String(row[keyField])}
                  className={rowClassName}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {renderCells(row)}
                </tr>
              ))}
            </tbody>
          )}
          {data.length === 0 && (
            <tbody>
              <tr>
                <td
                  colSpan={visibleColumns.length + (reorder ? 1 : 0)}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            </tbody>
          )}
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
