import { useCallback, useEffect, useState } from "react"
import api from "@/api/client"
import CategoryEditDrawer from "@/components/admin/CategoryEditDrawer"
import type { AdminCategoryItem } from "@/components/admin/CategoryEditDrawer"
import CategoryFormModal from "@/components/admin/CategoryFormModal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Table } from "@/components/ui/Table"
import type { TableColumn } from "@/components/ui/Table"
import { useToast } from "@/components/ui/Toast"

const PAGE_SIZE = 10

export default function AdminCategoriesPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState<AdminCategoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AdminCategoryItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminCategoryItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [savingStatusId, setSavingStatusId] = useState<number | null>(null)

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.get("/admin/categories", { params: { offset, limit: PAGE_SIZE } })
      setItems(res.data.data.items)
      setTotal(res.data.data.total)
    } catch (err: any) {
      setError(err.response?.data?.msg || "分类列表加载失败")
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => {
    load()
  }, [load])

  const handleSaved = async () => {
    setCreateOpen(false)
    setEditing(null)
    await load()
    addToast({ type: "success", message: "分类已保存" })
  }

  const toggleStatus = async (item: AdminCategoryItem) => {
    setSavingStatusId(item.id)
    try {
      await api.put(`/admin/categories/${item.id}`, { is_active: !item.is_active })
      addToast({ type: "success", message: item.is_active ? "分类已下架" : "分类已上架" })
      await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "状态更新失败" })
    } finally {
      setSavingStatusId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/admin/categories/${deleteTarget.id}`)
      setDeleteTarget(null)
      addToast({ type: "success", message: "分类已删除" })
      if (items.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE))
      else await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "删除失败" })
    } finally {
      setDeleting(false)
    }
  }

  const columns: TableColumn<AdminCategoryItem>[] = [
    {
      key: "sort_order",
      title: "排序",
      width: 100,
      render: (item) => <span className="font-semibold text-[#5d6675]">{item.sort_order}</span>,
    },
    {
      key: "name",
      title: "名称",
      width: 180,
      render: (item) => <span className="font-semibold text-[#111827]">{item.name}</span>,
    },
    {
      key: "subtitle",
      title: "副标题",
      width: 260,
      render: (item) => <span className="text-[#5d6675]">{item.subtitle || "暂无副标题"}</span>,
    },
    {
      key: "product_count",
      title: "关联商品",
      width: 130,
      render: (item) => <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-13 font-semibold text-primary-600">{item.product_count} 个</span>,
    },
    {
      key: "is_active",
      title: "状态",
      width: 130,
      render: (item) => (
        <button
          disabled={savingStatusId === item.id}
          onClick={(event) => { event.stopPropagation(); toggleStatus(item) }}
          className={"inline-flex h-8 items-center rounded-full px-3 text-13 font-medium " + (item.is_active ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-500")}
        >
          {item.is_active ? "上架" : "下架"}
        </button>
      ),
    },
    {
      key: "updated_at",
      title: "更新时间",
      width: 180,
      render: (item) => <span className="text-[#6b7990]">{item.updated_at || "-"}</span>,
    },
    {
      key: "actions",
      title: "操作",
      align: "center",
      width: 180,
      render: (item) => (
        <div className="admin-action-group">
          <button onClick={(event) => { event.stopPropagation(); setEditing(item) }} className="admin-action-button">
            编辑
          </button>
          <button onClick={(event) => { event.stopPropagation(); setDeleteTarget(item) }} className="admin-action-button admin-action-button-danger">
            删除
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 border-b border-[#edf1f6] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
          <div>
            <h1 className="text-24 font-bold text-[#111827]">分类管理</h1>
            <p className="mt-1 text-14 text-[#8e99aa]">维护前台分类名称、副标题、关联商品、排序和上下架状态</p>
          </div>
          <button onClick={() => setCreateOpen(true)} className="inline-flex h-11 items-center justify-center rounded-[14px] bg-primary-500 px-6 text-15 font-semibold text-white shadow-lg shadow-primary-500/20 hover:bg-primary-600">
            新增分类
          </button>
        </div>

        {error && <div className="mx-8 mt-5 rounded-[14px] bg-danger-50 px-4 py-3 text-14 text-danger-500">{error}</div>}

        <Table columns={columns} dataSource={items} rowKey="id" loading={loading} emptyText="暂无分类数据" />

        <div className="flex flex-col gap-3 border-t border-[#edf1f6] px-5 py-5 text-14 text-[#6b7990] md:flex-row md:items-center md:justify-between md:px-8">
          <span>共 {total} 个分类，第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">上一页</button>
            <button disabled={page >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>

      <CategoryFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={handleSaved} />
      <CategoryEditDrawer open={!!editing} category={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除分类"
        message={deleteTarget ? `确定删除「${deleteTarget.name}」吗？有关联商品时系统会阻止删除。` : ""}
        confirmText="删除"
        danger
        loading={deleting}
      />
    </div>
  )
}
