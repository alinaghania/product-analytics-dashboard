"use client"

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable, type PaginationState } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Download, RefreshCcw } from "lucide-react"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  pageCount?: number
  pagination?: PaginationState
  onPaginationChange?: (pagination: PaginationState) => void
  isLoading?: boolean
  onReload?: () => void
  onExport?: () => void
  emptyMessage?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageCount = 1,
  pagination,
  onPaginationChange,
  isLoading,
  onReload,
  onExport,
  emptyMessage = "No results found.",
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      pagination,
    },
    onPaginationChange: (updater) => {
      if (onPaginationChange && pagination) {
        const newPagination = typeof updater === "function" ? updater(pagination) : updater
        onPaginationChange(newPagination)
      }
    },
  })

  return (
    <div className="space-y-4">
      {/* Table Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onReload && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReload}
              disabled={isLoading}
              className="gap-2 bg-transparent"
            >
              <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Reload
            </Button>
          )}
        </div>
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport} className="gap-2 bg-transparent">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <RefreshCcw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="border-border transition-colors hover:bg-card-soft">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-sm text-foreground">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.pageIndex + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="bg-transparent"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
