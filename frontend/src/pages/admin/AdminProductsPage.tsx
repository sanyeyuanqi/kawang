import { useCallback, useEffect, useMemo, useState } from "react"
import api from "@/api/client"
import ProductFormModal from "@/components/admin/ProductFormModal"
import type { AdminCategoryOption, AdminProductItem } from "@/components/admin/ProductFormModal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useToast } from "@/components/ui/Toast"
import { formatPrice, resolveAssetUrl } from "@/lib/utils"

const PAGE_SIZE = 10

export default function AdminProductsPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState<AdminProductItem[]>([])
  const [categories, setCategories] = useState<AdminCategoryOption[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminProductItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminProductItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [savingSortId, setSavingSortId] = useState<number | null>(null)
  const [failedImageIds, setFailedImageIds] = useState<Set<number>>(() => new Set())

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.get("/admin/products", { params: { offset, limit: PAGE_SIZE } })
      setItems(res.data.data.items)
      setTotal(res.data.data.total)
      setFailedImageIds(new Set())
    } catch (err: any) {
      setError(err.response?.data?.msg || "商品列表加载失败")
    } finally {
      setLoading(false)
    }
  }, [offset])

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.get("/admin/categories", { params: { offset: 0, limit: 100 } })
      setCategories(res.data.data.items.map((item: any) => ({ id: item.id, name: item.name })))
    } catch {
      setCategories([])
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const stats = useMemo(() => {
    const onSale = items.filter((item) => item.status === "on_sale").length
    const soldOut = items.filter((item) => item.status === "sold_out").length
    return { onSale, soldOut }
  }, [items])

  const startCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const handleSaved = async () => {
    setFormOpen(false)
    setEditing(null)
    await loadProducts()
    addToast({ type: "success", message: "商品已保存" })
  }

  const handleSortChange = (id: number, value: string) => {
    const next = Number(value || 0)
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, sort_order: next } : item))
  }

  const saveSort = async (item: AdminProductItem) => {
    setSavingSortId(item.id)
    try {
      await api.put(`/admin/products/${item.id}`, { sort_order: item.sort_order })
      addToast({ type: "success", message: "排序已更新" })
      await loadProducts()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "排序保存失败" })
      await loadProducts()
    } finally {
      setSavingSortId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/admin/products/${deleteTarget.id}`)
      setDeleteTarget(null)
      addToast({ type: "success", message: "商品已删除" })
      if (items.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE))
      else await loadProducts()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "删除失败" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 border-b border-[#edf1f6] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
          <div>
            <h1 className="text-24 font-bold text-[#111827]">商品管理</h1>
            <p className="mt-1 text-14 text-[#8e99aa]">维护前台销售商品、分类、价格、排序与库存状态</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex h-11 items-center rounded-[14px] bg-success-50 px-4 text-14 font-semibold text-success-600">在售 {stats.onSale}</span>
            <span className="inline-flex h-11 items-center rounded-[14px] bg-danger-50 px-4 text-14 font-semibold text-danger-500">售罄 {stats.soldOut}</span>
            <button onClick={startCreate} className="inline-flex h-11 items-center justify-center rounded-[14px] bg-primary-500 px-6 text-15 font-semibold text-white shadow-lg shadow-primary-500/20 transition-colors hover:bg-primary-600">
              新增商品
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-8 mt-5 rounded-[14px] bg-danger-50 px-4 py-3 text-14 text-danger-500">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-14">
            <thead className="text-[#8e99aa]">
              <tr className="border-b border-[#edf1f6]">
                <th className="w-[64px] px-6 py-5 text-left font-medium">ID</th>
                <th className="w-[86px] px-4 py-5 text-left font-medium">排序</th>
                <th className="w-[230px] px-4 py-5 text-left font-medium">商品</th>
                <th className="w-[280px] px-4 py-5 text-left font-medium">商品描述</th>
                <th className="w-[140px] px-4 py-5 text-left font-medium">分类</th>
                <th className="w-[105px] px-4 py-5 text-left font-medium">价格</th>
                <th className="w-[76px] px-4 py-5 text-left font-medium">库存</th>
                <th className="w-[76px] px-4 py-5 text-left font-medium">已售</th>
                <th className="w-[86px] px-4 py-5 text-left font-medium">状态</th>
                <th className="sticky right-0 z-10 w-[180px] bg-white px-6 py-5 text-center font-medium shadow-[-10px_0_18px_-18px_rgba(15,23,42,0.45)]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6] text-[#293344]">
              {loading && Array.from({ length: 5 }).map((_, index) => (
                <tr key={`loading-${index}`}>
                  <td colSpan={10} className="px-8 py-5">
                    <div className="h-10 animate-pulse rounded-[12px] bg-[#f1f5fb]" />
                  </td>
                </tr>
              ))}

              {!loading && items.map((item) => (
                <tr key={item.id} className="group transition-colors hover:bg-[#f8fbff]">
                  <td className="px-6 py-5 font-medium text-[#5d6675]">#{item.id}</td>
                  <td className="px-4 py-5">
                    <input
                      type="number"
                      value={item.sort_order}
                      onChange={(event) => handleSortChange(item.id, event.target.value)}
                      onBlur={() => saveSort(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur()
                      }}
                      disabled={savingSortId === item.id}
                      className="h-9 w-[66px] rounded-[10px] border border-[#dfe6ef] bg-white px-3 text-13 outline-none focus:border-primary-500 disabled:opacity-60"
                    />
                  </td>
                  <td className="px-4 py-5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-[54px] w-24 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[#eef3ff] text-15 font-bold text-primary-500">
                        {item.cover_image && !failedImageIds.has(item.id) ? (
                          <img
                            src={resolveAssetUrl(item.cover_image)}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={() => {
                              setFailedImageIds((current) => {
                                const next = new Set(current)
                                next.add(item.id)
                                return next
                              })
                            }}
                          />
                        ) : item.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#111827]">{item.name}</p>
                        <p className="mt-0.5 text-12 text-[#8e99aa]">自动发货商品</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-[#5d6675]">
                    <p className="max-w-[260px] truncate">{item.description || "暂无描述"}</p>
                  </td>
                  <td className="px-4 py-5 text-[#5d6675]">{item.category_name || "未分类"}</td>
                  <td className="px-4 py-5 font-semibold text-danger-500">{formatPrice(item.price)}</td>
                  <td className="px-4 py-5 text-[#5d6675]">{item.stock ?? item.available_stock}</td>
                  <td className="px-4 py-5 text-[#5d6675]">{item.sold_count ?? 0}</td>
                  <td className="px-4 py-5">
                    <span className={"inline-flex h-8 items-center rounded-full px-3 text-13 font-medium " + (item.status === "on_sale" ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-500")}>
                      {item.status === "on_sale" ? "在售" : "售罄"}
                    </span>
                  </td>
                  <td className="sticky right-0 z-10 bg-white px-6 py-5 text-center shadow-[-10px_0_18px_-18px_rgba(15,23,42,0.45)] group-hover:bg-[#f8fbff]">
                    <div className="admin-action-group">
                      <button onClick={() => { setEditing(item); setFormOpen(true) }} className="admin-action-button">
                        编辑
                      </button>
                      <button onClick={() => setDeleteTarget(item)} className="admin-action-button admin-action-button-danger">
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-8 py-16 text-center text-[#8e99aa]">暂无商品数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#edf1f6] px-5 py-5 text-14 text-[#6b7990] md:flex-row md:items-center md:justify-between md:px-8">
          <span>共 {total} 个商品，第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ProductFormModal
        open={formOpen}
        product={editing}
        categories={categories}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除商品"
        message={deleteTarget ? `确定删除「${deleteTarget.name}」吗？删除后前台将不再展示该商品。` : ""}
        confirmText="删除"
        danger
        loading={deleting}
      />
    </div>
  )
}
