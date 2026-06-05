import { useCallback, useEffect, useMemo, useState } from "react"
import api from "@/api/client"
import CodeKeyDetailModal from "@/components/admin/CodeKeyDetailModal"
import type { CodeKeyItem, CodeKeyStockItem } from "@/components/admin/CodeKeyDetailModal"
import CodeKeyImportModal from "@/components/admin/CodeKeyImportModal"
import type { CodeKeyProductOption } from "@/components/admin/CodeKeyImportModal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Table } from "@/components/ui/Table"
import type { TableColumn } from "@/components/ui/Table"
import { useToast } from "@/components/ui/Toast"

const PAGE_SIZE = 10
const CODE_PAGE_SIZE = 10

const statCardClass = "rounded-[18px] bg-white px-5 py-5 shadow-[0_22px_60px_rgba(15,23,42,0.06)]"

export default function AdminCodeKeysPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState<CodeKeyStockItem[]>([])
  const [products, setProducts] = useState<CodeKeyProductOption[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const [importProductId, setImportProductId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [selectedStock, setSelectedStock] = useState<CodeKeyStockItem | null>(null)
  const [codes, setCodes] = useState<CodeKeyItem[]>([])
  const [codesTotal, setCodesTotal] = useState(0)
  const [codesOffset, setCodesOffset] = useState(0)
  const [codesLoading, setCodesLoading] = useState(false)
  const [savingSortId, setSavingSortId] = useState<number | null>(null)
  const [savingCodeId, setSavingCodeId] = useState<number | null>(null)
  const [deleteStockTarget, setDeleteStockTarget] = useState<CodeKeyStockItem | null>(null)
  const [deleteCodeTarget, setDeleteCodeTarget] = useState<CodeKeyItem | null>(null)
  const [deleteCodeTargets, setDeleteCodeTargets] = useState<CodeKeyItem[]>([])
  const [deleting, setDeleting] = useState(false)

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadStock = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.get("/admin/code-keys", { params: { offset, limit: PAGE_SIZE } })
      setItems(res.data.data.items)
      setTotal(res.data.data.total)
    } catch (err: any) {
      setError(err.response?.data?.msg || "卡密库存加载失败")
    } finally {
      setLoading(false)
    }
  }, [offset])

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.get("/admin/products", { params: { offset: 0, limit: 100 } })
      setProducts(res.data.data.items.map((item: any) => ({ id: item.id, name: item.name })))
    } catch {
      setProducts([])
    }
  }, [])

  const loadCodes = useCallback(async (stock: CodeKeyStockItem, nextOffset = codesOffset) => {
    setCodesLoading(true)
    try {
      const res = await api.get(`/admin/code-keys/${stock.product_id}/codes`, {
        params: { offset: nextOffset, limit: CODE_PAGE_SIZE },
      })
      setCodes(res.data.data.items)
      setCodesTotal(res.data.data.total)
      setCodesOffset(nextOffset)
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "卡密明细加载失败" })
    } finally {
      setCodesLoading(false)
    }
  }, [addToast, codesOffset])

  useEffect(() => {
    loadStock()
  }, [loadStock])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    if (importOpen) loadProducts()
  }, [importOpen, loadProducts])

  const productOptions = useMemo(() => {
    if (products.length) return products
    return items.map((item) => ({ id: item.product_id, name: item.product_name }))
  }, [items, products])

  const stats = useMemo(() => {
    return items.reduce(
      (acc, item) => ({
        products: acc.products + 1,
        unused: acc.unused + item.unused_count,
        assigned: acc.assigned + item.assigned_count,
        total: acc.total + item.total_count,
      }),
      { products: 0, unused: 0, assigned: 0, total: 0 },
    )
  }, [items])

  const openDetail = async (stock: CodeKeyStockItem) => {
    setSelectedStock(stock)
    setCodesOffset(0)
    await loadCodes(stock, 0)
  }

  const handleImport = async (payload: { product_id: number; codes: string }) => {
    setImporting(true)
    try {
      const res = await api.post("/admin/code-keys/import", payload)
      setImportOpen(false)
      addToast({ type: "success", message: res.data.data?.message || "卡密已导入" })
      await loadStock()
      if (selectedStock?.product_id === payload.product_id) {
        await loadCodes(selectedStock, 0)
      }
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "导入失败" })
    } finally {
      setImporting(false)
    }
  }

  const handleSortChange = (id: number, value: string) => {
    const next = Number(value || 0)
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, sort_order: next } : item))
  }

  const saveSort = async (item: CodeKeyStockItem) => {
    setSavingSortId(item.id)
    try {
      await api.put(`/admin/code-keys/${item.id}`, { sort_order: item.sort_order })
      addToast({ type: "success", message: "排序已更新" })
      await loadStock()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "排序保存失败" })
      await loadStock()
    } finally {
      setSavingSortId(null)
    }
  }

  const saveCode = async (code: CodeKeyItem, codeValue: string, status: string) => {
    setSavingCodeId(code.id)
    try {
      await api.put(`/admin/code-keys/codes/${code.id}`, { code_value: codeValue, status })
      addToast({ type: "success", message: "卡密已更新" })
      if (selectedStock) await loadCodes(selectedStock, codesOffset)
      await loadStock()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "卡密更新失败" })
    } finally {
      setSavingCodeId(null)
    }
  }

  const confirmDeleteStock = async () => {
    if (!deleteStockTarget) return
    setDeleting(true)
    try {
      const res = await api.delete(`/admin/code-keys/${deleteStockTarget.id}`)
      setDeleteStockTarget(null)
      addToast({ type: "success", message: `已删除 ${res.data.data?.deleted_count ?? 0} 条未使用卡密` })
      if (items.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE))
      else await loadStock()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "删除失败" })
    } finally {
      setDeleting(false)
    }
  }

  const confirmDeleteCode = async () => {
    if (!deleteCodeTarget || !selectedStock) return
    setDeleting(true)
    try {
      await api.delete(`/admin/code-keys/codes/${deleteCodeTarget.id}`)
      setDeleteCodeTarget(null)
      addToast({ type: "success", message: "卡密已删除" })
      await loadCodes(selectedStock, codesOffset)
      await loadStock()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "删除失败" })
    } finally {
      setDeleting(false)
    }
  }

  const confirmBatchDeleteCodes = async () => {
    if (!deleteCodeTargets.length || !selectedStock) return
    setDeleting(true)
    try {
      const ids = deleteCodeTargets.map((code) => code.id)
      const res = await api.delete("/admin/code-keys/codes/batch-delete", { data: { ids } })
      const deletedCount = res.data.data?.deleted_count ?? ids.length
      const nextTotal = Math.max(0, codesTotal - deletedCount)
      const nextOffset = codesOffset >= nextTotal ? Math.max(0, codesOffset - CODE_PAGE_SIZE) : codesOffset
      setDeleteCodeTargets([])
      addToast({ type: "success", message: `已删除 ${deletedCount} 条卡密` })
      await loadCodes(selectedStock, nextOffset)
      await loadStock()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "批量删除失败" })
    } finally {
      setDeleting(false)
    }
  }

  const columns: TableColumn<CodeKeyStockItem>[] = [
    {
      key: "id",
      title: "ID",
      width: 80,
      render: (item) => <span className="font-medium text-[#6b7990]">#{item.product_id}</span>,
    },
    {
      key: "sort_order",
      title: "排序",
      width: 100,
      render: (item) => (
        <input
          type="number"
          value={item.sort_order}
          onChange={(event) => handleSortChange(item.id, event.target.value)}
          onBlur={() => saveSort(item)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
          onClick={(event) => event.stopPropagation()}
          disabled={savingSortId === item.id}
          className="h-9 w-[68px] rounded-[10px] border border-[#dfe6ef] bg-white px-3 text-13 outline-none focus:border-primary-500 disabled:opacity-60"
        />
      ),
    },
    {
      key: "product_name",
      title: "商品",
      width: 260,
      render: (item) => <span className="font-semibold text-[#111827]">{item.product_name}</span>,
    },
    {
      key: "category_name",
      title: "分类",
      width: 160,
      render: (item) => <span className="text-[#5d6675]">{item.category_name || "未分类"}</span>,
    },
    {
      key: "unused_count",
      title: "未用",
      width: 110,
      render: (item) => <span className="rounded-full bg-success-50 px-3 py-1 text-13 font-semibold text-success-600">{item.unused_count}</span>,
    },
    {
      key: "assigned_count",
      title: "已用",
      width: 110,
      render: (item) => <span className="rounded-full bg-primary-50 px-3 py-1 text-13 font-semibold text-primary-600">{item.assigned_count}</span>,
    },
    {
      key: "total_count",
      title: "总量",
      width: 110,
      render: (item) => <span className="font-semibold text-[#293344]">{item.total_count}</span>,
    },
    {
      key: "last_import_time",
      title: "最后导入",
      width: 190,
      render: (item) => <span className="text-[#6b7990]">{item.last_import_time || "-"}</span>,
    },
    {
      key: "actions",
      title: "操作",
      align: "center",
      width: 220,
      render: (item) => (
        <div className="admin-action-group">
          <button onClick={(event) => { event.stopPropagation(); openDetail(item) }} className="admin-action-button">
            明细
          </button>
          <button onClick={(event) => { event.stopPropagation(); setImportProductId(item.product_id); setImportOpen(true) }} className="admin-action-button admin-action-button-success">
            导入
          </button>
          <button onClick={(event) => { event.stopPropagation(); setDeleteStockTarget(item) }} className="admin-action-button admin-action-button-danger">
            删除
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className={statCardClass}>
          <p className="text-13 font-medium text-[#8e99aa]">商品记录</p>
          <strong className="mt-2 block text-26 text-[#111827]">{stats.products}</strong>
        </div>
        <div className={statCardClass}>
          <p className="text-13 font-medium text-[#8e99aa]">未用卡密</p>
          <strong className="mt-2 block text-26 text-success-600">{stats.unused}</strong>
        </div>
        <div className={statCardClass}>
          <p className="text-13 font-medium text-[#8e99aa]">已发卡密</p>
          <strong className="mt-2 block text-26 text-primary-600">{stats.assigned}</strong>
        </div>
        <div className={statCardClass}>
          <p className="text-13 font-medium text-[#8e99aa]">库存总量</p>
          <strong className="mt-2 block text-26 text-[#111827]">{stats.total}</strong>
        </div>
      </div>

      <div className="rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 border-b border-[#edf1f6] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
          <div>
            <h1 className="text-24 font-bold text-[#111827]">卡密库存</h1>
            <p className="mt-1 text-14 text-[#8e99aa]">按商品聚合管理卡密库存、导入记录和发卡状态</p>
          </div>
          <button onClick={() => { setImportProductId(null); setImportOpen(true) }} className="inline-flex h-11 items-center justify-center rounded-[14px] bg-primary-500 px-6 text-15 font-semibold text-white shadow-lg shadow-primary-500/20 hover:bg-primary-600">
            导入卡密
          </button>
        </div>

        {error && <div className="mx-8 mt-5 rounded-[14px] bg-danger-50 px-4 py-3 text-14 text-danger-500">{error}</div>}

        <Table columns={columns} dataSource={items} rowKey="id" loading={loading} emptyText="暂无卡密库存数据" onRowClick={openDetail} />

        <div className="flex flex-col gap-3 border-t border-[#edf1f6] px-5 py-5 text-14 text-[#6b7990] md:flex-row md:items-center md:justify-between md:px-8">
          <span>共 {total} 个商品库存，第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">上一页</button>
            <button disabled={page >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>

      <CodeKeyImportModal
        open={importOpen}
        products={productOptions}
        defaultProductId={importProductId}
        loading={importing}
        onClose={() => { setImportOpen(false); setImportProductId(null) }}
        onSubmit={handleImport}
      />

      <CodeKeyDetailModal
        open={!!selectedStock && !importOpen}
        stock={selectedStock}
        codes={codes}
        total={codesTotal}
        offset={codesOffset}
        limit={CODE_PAGE_SIZE}
        loading={codesLoading}
        savingId={savingCodeId}
        onClose={() => setSelectedStock(null)}
        onPageChange={(nextOffset) => selectedStock && loadCodes(selectedStock, nextOffset)}
        onSave={saveCode}
        onDelete={(code) => setDeleteCodeTarget(code)}
        onBatchDelete={(targets) => setDeleteCodeTargets(targets)}
      />

      <ConfirmDialog
        open={!!deleteStockTarget}
        onClose={() => setDeleteStockTarget(null)}
        onConfirm={confirmDeleteStock}
        title="删除库存记录"
        message={deleteStockTarget ? `确定删除「${deleteStockTarget.product_name}」下所有未使用卡密吗？已发卡记录会保留。` : ""}
        confirmText="删除"
        danger
        loading={deleting}
      />

      <ConfirmDialog
        open={!!deleteCodeTarget}
        onClose={() => setDeleteCodeTarget(null)}
        onConfirm={confirmDeleteCode}
        title="删除卡密"
        message={deleteCodeTarget ? `确定删除 #${deleteCodeTarget.id} 这条未使用卡密吗？` : ""}
        confirmText="删除"
        danger
        loading={deleting}
      />

      <ConfirmDialog
        open={deleteCodeTargets.length > 0}
        onClose={() => setDeleteCodeTargets([])}
        onConfirm={confirmBatchDeleteCodes}
        title="批量删除卡密"
        message={`确定删除选中的 ${deleteCodeTargets.length} 条卡密吗？已发卡卡密不会被选中。`}
        confirmText="删除"
        danger
        loading={deleting}
      />
    </div>
  )
}
