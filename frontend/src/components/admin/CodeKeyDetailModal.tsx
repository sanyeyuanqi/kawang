import { useEffect, useMemo, useState } from "react"
import { Modal } from "@/components/ui/Modal"

export interface CodeKeyStockItem {
  id: number
  product_id: number
  sort_order: number
  product_name: string
  category_name: string | null
  unused_count: number
  assigned_count: number
  total_count: number
  last_import_time: string | null
}

export interface CodeKeyItem {
  id: number
  product_id: number
  product_name?: string
  code_value: string
  status: "unused" | "reserved" | "assigned" | "revoked" | string
  order_id: number | null
  contact_info?: string | null
  created_at: string | null
}

const statusText: Record<string, string> = {
  unused: "未使用",
  reserved: "预占中",
  assigned: "已发卡",
  revoked: "已撤销",
}

const statusClass: Record<string, string> = {
  unused: "bg-success-50 text-success-600",
  reserved: "bg-warning-50 text-warning-600",
  assigned: "bg-primary-50 text-primary-600",
  revoked: "bg-gray-100 text-gray-500",
}

interface Props {
  open: boolean
  stock: CodeKeyStockItem | null
  codes: CodeKeyItem[]
  total: number
  offset: number
  limit: number
  loading?: boolean
  savingId?: number | null
  onClose: () => void
  onPageChange: (offset: number) => void
  onSave: (code: CodeKeyItem, nextValue: string, nextStatus: string) => Promise<void>
  onDelete: (code: CodeKeyItem) => void
  onBatchDelete: (codes: CodeKeyItem[]) => void
}

export default function CodeKeyDetailModal({
  open,
  stock,
  codes,
  total,
  offset,
  limit,
  loading = false,
  savingId,
  onClose,
  onPageChange,
  onSave,
  onDelete,
  onBatchDelete,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [editingStatus, setEditingStatus] = useState("unused")
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setEditingValue("")
      setEditingStatus("unused")
      setSelectedIds([])
    }
  }, [open])

  useEffect(() => {
    setSelectedIds([])
  }, [codes])

  const page = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const deletableCodes = useMemo(() => codes.filter((code) => code.status !== "assigned" && !code.order_id), [codes])
  const selectedCodes = useMemo(() => codes.filter((code) => selectedIds.includes(code.id)), [codes, selectedIds])
  const allDeletableSelected = deletableCodes.length > 0 && deletableCodes.every((code) => selectedIds.includes(code.id))

  const startEdit = (code: CodeKeyItem) => {
    setEditingId(code.id)
    setEditingValue(code.code_value)
    setEditingStatus(code.status)
  }

  const submitEdit = async (code: CodeKeyItem) => {
    await onSave(code, editingValue, editingStatus)
    setEditingId(null)
  }

  const toggleCode = (code: CodeKeyItem, checked: boolean) => {
    setSelectedIds((prev) => checked ? [...prev, code.id] : prev.filter((id) => id !== code.id))
  }

  const togglePage = (checked: boolean) => {
    setSelectedIds(checked ? deletableCodes.map((code) => code.id) : [])
  }

  return (
    <Modal open={open} onClose={onClose} title={stock ? `${stock.product_name} · 卡密明细` : "卡密明细"} className="md:max-w-[1120px] xl:max-w-[1180px]">
      <div className="space-y-4">
        {stock && (
          <div className="grid gap-3 rounded-[14px] bg-[#f6f9fe] p-4 text-14 sm:grid-cols-4">
            <div><span className="block text-[#8e99aa]">未使用</span><strong className="text-success-600">{stock.unused_count}</strong></div>
            <div><span className="block text-[#8e99aa]">已发卡</span><strong className="text-primary-600">{stock.assigned_count}</strong></div>
            <div><span className="block text-[#8e99aa]">总库存</span><strong className="text-[#111827]">{stock.total_count}</strong></div>
            <div><span className="block text-[#8e99aa]">最后导入</span><strong className="text-[#293344]">{stock.last_import_time || "-"}</strong></div>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-[14px] border border-[#edf1f6] bg-white px-4 py-3 text-14 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[#6b7990]">已选 {selectedIds.length} 条</span>
          <button
            onClick={() => onBatchDelete(selectedCodes)}
            disabled={selectedIds.length === 0 || loading}
            className="h-9 rounded-[10px] bg-danger-50 px-4 text-13 font-semibold text-danger-500 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            批量删除
          </button>
        </div>

        <div className="overflow-x-auto rounded-[14px] border border-[#edf1f6]">
          <table className="w-full min-w-[960px] table-fixed text-14">
            <colgroup>
              <col className="w-[48px]" />
              <col className="w-[72px]" />
              <col className="w-[36%]" />
              <col className="w-[112px]" />
              <col className="w-[30%]" />
              <col className="w-[152px]" />
            </colgroup>
            <thead className="bg-[#fbfdff] text-[#8e99aa]">
              <tr>
                <th className="px-4 py-4 text-left font-medium">
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    disabled={deletableCodes.length === 0}
                    onChange={(event) => togglePage(event.target.checked)}
                    className="h-4 w-4 accent-[#2562eb] disabled:opacity-40"
                  />
                </th>
                <th className="px-4 py-4 text-left font-medium">ID</th>
                <th className="px-4 py-4 text-left font-medium">卡密</th>
                <th className="px-4 py-4 text-left font-medium">状态</th>
                <th className="px-4 py-4 text-left font-medium">联系方式</th>
                <th className="px-4 py-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6] text-[#293344]">
              {loading && Array.from({ length: 4 }).map((_, index) => (
                <tr key={index}><td colSpan={6} className="px-4 py-4"><div className="h-9 animate-pulse rounded-[10px] bg-[#f1f5fb]" /></td></tr>
              ))}
              {!loading && codes.map((code) => {
                const isEditing = editingId === code.id
                const locked = code.status === "assigned" || !!code.order_id
                return (
                  <tr key={code.id}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(code.id)}
                        disabled={locked}
                        onChange={(event) => toggleCode(code, event.target.checked)}
                        className="h-4 w-4 accent-[#2562eb] disabled:opacity-35"
                      />
                    </td>
                    <td className="px-4 py-4 font-medium text-[#6b7990]">#{code.id}</td>
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input value={editingValue} onChange={(event) => setEditingValue(event.target.value)} className="h-9 w-full rounded-[10px] border border-[#dfe6ef] px-3 font-mono text-13 outline-none focus:border-primary-500" />
                      ) : (
                        <span className="break-all font-mono text-13">{code.code_value}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <select value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)} disabled={locked} className="h-9 w-full rounded-[10px] border border-[#dfe6ef] px-2 text-13 outline-none focus:border-primary-500 disabled:opacity-60">
                          <option value="unused">未使用</option>
                          <option value="reserved">预占中</option>
                          <option value="revoked">已撤销</option>
                        </select>
                      ) : (
                        <span className={`inline-flex h-8 items-center rounded-full px-3 text-13 font-medium ${statusClass[code.status] || "bg-gray-100 text-gray-500"}`}>
                          {statusText[code.status] || code.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[#6b7990]">
                      <span className="block truncate" title={code.contact_info || "-"}>
                        {code.contact_info || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-nowrap justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button onClick={() => setEditingId(null)} disabled={savingId === code.id} className="h-8 rounded-[10px] border border-[#dfe6ef] px-3 text-13 font-semibold text-[#5d6675]">取消</button>
                            <button onClick={() => submitEdit(code)} disabled={savingId === code.id || !editingValue.trim()} className="h-8 rounded-[10px] bg-primary-500 px-3 text-13 font-semibold text-white disabled:opacity-50">保存</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(code)} disabled={locked} className="h-8 rounded-[10px] border border-[#dfe6ef] px-3 text-13 font-semibold text-primary-600 disabled:cursor-not-allowed disabled:opacity-45">编辑</button>
                            <button onClick={() => onDelete(code)} disabled={locked} className="h-8 rounded-[10px] bg-danger-50 px-3 text-13 font-semibold text-danger-500 disabled:cursor-not-allowed disabled:opacity-45">删除</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && codes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-[#8e99aa]">暂无卡密</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-14 text-[#6b7990]">
          <span>共 {total} 条，第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => onPageChange(Math.max(0, offset - limit))} className="h-9 rounded-[10px] border border-[#dfe6ef] px-3 font-semibold disabled:opacity-50">上一页</button>
            <button disabled={page >= totalPages} onClick={() => onPageChange(offset + limit)} className="h-9 rounded-[10px] border border-[#dfe6ef] px-3 font-semibold disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
