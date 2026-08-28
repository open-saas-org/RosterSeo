"use client";

import { ChevronLeft, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown, type LucideIcon } from "lucide-react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Shared feature set every page's table is built against - see
// createDataTableColumns() below. Keeping this in one place (rather than
// each page re-registering features) is what makes DataTable reusable
// instead of every page reinventing sorting/pagination setup.
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

export function createDataTableColumns<TData extends RowData>() {
  return createColumnHelper<typeof dataTableFeatures, TData>();
}

export type DataTableColumnDef<TData extends RowData> = ColumnDef<typeof dataTableFeatures, TData, any>;

export function DataTable<TData extends RowData>({
  columns,
  data,
  pageSize = 10,
  emptyMessage = "No data yet.",
  emptyIcon: EmptyIcon,
  getRowClassName,
  bordered = true,
}: {
  columns: DataTableColumnDef<TData>[];
  data: TData[];
  pageSize?: number;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  /** Optional per-row className (e.g. dim a disabled row) - applied to the <tr>. */
  getRowClassName?: (row: TData) => string | undefined;
  /** Set false when this table already sits inside another bordered
   * container (e.g. under a tab strip) - avoids a border-inside-a-border. */
  bordered?: boolean;
}) {
  const table = useTable(
    {
      features: dataTableFeatures,
      columns,
      data,
      initialState: { pagination: { pageIndex: 0, pageSize } },
    },
    (state) => ({ pagination: state.pagination, sorting: state.sorting }),
  );

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;

  return (
    <div className={cn("flex min-w-0 flex-col", bordered && "gap-3")}>
      <div className={cn("min-w-0 overflow-x-auto", bordered && "rounded-md border")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id} className={getRowClassName?.(row.original)}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {EmptyIcon ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-4">
                      <EmptyIcon className="size-6 text-muted-foreground/50" />
                      <span>{emptyMessage}</span>
                    </div>
                  ) : (
                    emptyMessage
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 || data.length > 10 ? (
        <div className={cn("flex items-center justify-between text-sm text-muted-foreground mt-2", !bordered && "border-t px-4 py-3 mt-0")}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs">Rows per page</span>
              <Select
                value={String(table.state.pagination.pageSize)}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger className="h-7 w-[70px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 25, 50, 100, 250].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span>
              Page {pageIndex + 1} of {pageCount || 1}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
