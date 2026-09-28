"use client";

import type { ReactNode } from "react";
import { tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Bone } from "./states";

export const tableFeatureSet = tableFeatures({
  columnMeta: {} as { className?: string; skeleton?: string },
});
export type Column<T extends RowData> = ColumnDef<typeof tableFeatureSet, T, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The Figma "tb" table. Wide tables scroll sideways inside their own focusable region, so every
 * column stays reachable on a phone.
 *
 * Rows become selectable when `onSelect` is given: the first cell renders a real button whose
 * hit area stretches across the whole row (see `SelectRowButton`).
 */
export function DataTable<T extends RowData>({
  label,
  columns,
  data,
  getRowId,
  selectedId,
  minWidth,
  loading,
  skeletonRows = 5,
  empty,
}: {
  label: string;
  columns: Column<T>[];
  data: T[];
  getRowId: (row: T) => string;
  selectedId?: string | null;
  minWidth: number;
  loading?: boolean;
  skeletonRows?: number;
  empty?: ReactNode;
}) {
  const table = useTable({ features: tableFeatureSet, columns, data, getRowId: (row) => getRowId(row) });

  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="-mx-1 overflow-x-auto overscroll-x-contain rounded-lg px-1 pb-1"
    >
      <table className="w-full table-fixed border-collapse text-left" style={{ minWidth }}>
        <caption className="sr-only">{label}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className={cn(
                    "h-6 border-b border-line pr-1.5 pb-2.75 pl-3 align-top text-11 font-semibold text-ink-3",
                    header.column.columnDef.meta?.className,
                  )}
                >
                  <table.FlexRender header={header} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody aria-busy={loading || undefined}>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i}>
                  {columns.map((column, j) => (
                    <td key={j} className="h-12.25 border-b border-line-row pr-1.5 pl-3">
                      <Bone className={column.meta?.skeleton ?? "w-3/4"} />
                    </td>
                  ))}
                </tr>
              ))
            : table.getRowModel().rows.map((row) => {
                const selected = selectedId != null && row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    className={cn("group/row relative", selected ? "bg-row-selected" : "hover:bg-page/40")}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="h-12.25 border-b border-line-row pr-1.5 pl-3 text-13 leading-17 text-ink-2"
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && data.length === 0 && empty}
    </div>
  );
}

/** Cell text that never wraps; the full value stays available on hover. */
export function Truncate({ children }: { children: string }) {
  return (
    <span className="block truncate" title={children}>
      {children}
    </span>
  );
}

/** First-cell button that selects its row; its ::after covers the whole row so a click anywhere works. */
export function SelectRowButton({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className="rounded-5 font-medium text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-brand"
    >
      {children}
    </button>
  );
}
