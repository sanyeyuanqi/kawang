import type { ReactNode } from "react"
import { useLanguage } from "@/context/LanguageContext"

export interface TableColumn<T> {
  key: string
  title: ReactNode
  width?: number | string
  align?: "left" | "center" | "right"
  render?: (record: T, index: number) => ReactNode
}

interface TableProps<T> {
  columns: TableColumn<T>[]
  dataSource: T[]
  rowKey: keyof T | ((record: T) => string | number)
  loading?: boolean
  emptyText?: string
  onRowClick?: (record: T) => void
}

function getAlignClass(align?: "left" | "center" | "right") {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

export function Table<T extends object>({
  columns,
  dataSource,
  rowKey,
  loading = false,
  emptyText,
  onRowClick,
}: TableProps<T>) {
  const { st } = useLanguage()
  const resolveRowKey = (record: T) => {
    if (typeof rowKey === "function") return rowKey(record)
    return String(record[rowKey])
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-14">
        <thead className="text-[#8e99aa]">
          <tr className="border-b border-[#edf1f6]">
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width }}
                className={`px-5 py-5 font-medium ${getAlignClass(column.align)}`}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1f6] text-[#293344]">
          {loading && Array.from({ length: 5 }).map((_, index) => (
            <tr key={`loading-${index}`}>
              <td colSpan={columns.length} className="px-5 py-5">
                <div className="h-10 animate-pulse rounded-[12px] bg-[#f1f5fb]" />
              </td>
            </tr>
          ))}

          {!loading && dataSource.map((record, index) => (
            <tr
              key={resolveRowKey(record)}
              onClick={() => onRowClick?.(record)}
              className={onRowClick ? "cursor-pointer transition-colors hover:bg-[#f8fbff]" : "transition-colors hover:bg-[#f8fbff]"}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{ width: column.width }}
                  className={`px-5 py-5 ${getAlignClass(column.align)}`}
                >
                  {column.render ? column.render(record, index) : String((record as Record<string, unknown>)[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}

          {!loading && dataSource.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-5 py-16 text-center text-[#8e99aa]">
                {emptyText || st("暂无数据")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
