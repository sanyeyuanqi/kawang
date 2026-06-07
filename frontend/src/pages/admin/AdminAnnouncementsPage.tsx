import { useCallback, useEffect, useState } from "react"
import api from "@/api/client"
import AnnouncementFormModal from "@/components/admin/AnnouncementFormModal"
import type { AdminAnnouncementItem } from "@/components/admin/AnnouncementFormModal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Modal } from "@/components/ui/Modal"
import { SearchBar } from "@/components/ui/SearchBar"
import { Table } from "@/components/ui/Table"
import type { TableColumn } from "@/components/ui/Table"
import { useToast } from "@/components/ui/Toast"

const PAGE_SIZE = 10
type AnnouncementStatusFilter = "all" | "published" | "draft"

const statusOptions: { value: AnnouncementStatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "published", label: "已发布" },
  { value: "draft", label: "未发布" },
]

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : "-"
}

export default function AdminAnnouncementsPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState<AdminAnnouncementItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminAnnouncementItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncementItem | null>(null)
  const [previewTarget, setPreviewTarget] = useState<AdminAnnouncementItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [savingStatusId, setSavingStatusId] = useState<number | null>(null)
  const [savingSortId, setSavingSortId] = useState<number | null>(null)
  const [savingPinnedId, setSavingPinnedId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState("")
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatusFilter>("all")
  const [stats, setStats] = useState({ all: 0, published: 0, draft: 0 })

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = {
        offset,
        limit: PAGE_SIZE,
        q: keyword || undefined,
        status: statusFilter,
      }
      const res = await api.get("/admin/announcements", { params })
      setItems(res.data.data.items)
      setTotal(res.data.data.total)
      setStats(res.data.data.stats || { all: 0, published: 0, draft: 0 })
    } catch (err: any) {
      setError(err.response?.data?.msg || "公告列表加载失败")
    } finally {
      setLoading(false)
    }
  }, [keyword, offset, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (item: AdminAnnouncementItem) => {
    setEditing(item)
    setFormOpen(true)
  }

  const handleSaved = async () => {
    setFormOpen(false)
    setEditing(null)
    addToast({ type: "success", message: "公告已保存" })
    await load()
  }

  const togglePublished = async (item: AdminAnnouncementItem) => {
    setSavingStatusId(item.id)
    try {
      await api.put(`/admin/announcements/${item.id}`, { is_published: !item.is_published })
      addToast({ type: "success", message: item.is_published ? "公告已下线" : "公告已发布" })
      await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "发布状态更新失败" })
    } finally {
      setSavingStatusId(null)
    }
  }

  const togglePinned = async (item: AdminAnnouncementItem) => {
    setSavingPinnedId(item.id)
    try {
      const nextPinned = !item.is_pinned
      await api.put(`/admin/announcements/${item.id}`, nextPinned ? { is_pinned: true, is_published: true } : { is_pinned: false })
      addToast({ type: "success", message: nextPinned ? "公告已置顶并推送至首页" : "公告已取消置顶" })
      await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "置顶状态更新失败" })
    } finally {
      setSavingPinnedId(null)
    }
  }

  const handleSearch = (value: string) => {
    setKeyword(value)
    setOffset(0)
  }

  const handleStatusChange = (value: AnnouncementStatusFilter) => {
    setStatusFilter(value)
    setOffset(0)
  }

  const handleSortChange = (id: number, value: string) => {
    const next = Number(value || 0)
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, sort_order: next } : item))
  }

  const saveSort = async (item: AdminAnnouncementItem) => {
    setSavingSortId(item.id)
    try {
      await api.put(`/admin/announcements/${item.id}`, { sort_order: item.sort_order })
      addToast({ type: "success", message: "排序已更新" })
      await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "排序保存失败" })
      await load()
    } finally {
      setSavingSortId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/admin/announcements/${deleteTarget.id}`)
      setDeleteTarget(null)
      addToast({ type: "success", message: "公告已删除" })
      if (items.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE))
      else await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "公告删除失败" })
    } finally {
      setDeleting(false)
    }
  }

  const columns: TableColumn<AdminAnnouncementItem>[] = [
    {
      key: "sort_order",
      title: "排序",
      width: 90,
      render: item => (
        <input
          type="number"
          value={item.sort_order}
          onClick={event => event.stopPropagation()}
          onChange={event => handleSortChange(item.id, event.target.value)}
          onBlur={() => saveSort(item)}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
          disabled={savingSortId === item.id}
          className="h-9 w-[66px] rounded-[10px] border border-[#dfe6ef] bg-white px-3 text-13 font-semibold text-[#5d6675] outline-none focus:border-primary-500 disabled:opacity-60"
        />
      ),
    },
    {
      key: "title",
      title: "公告",
      width: 300,
      render: item => (
        <div className="max-w-[320px]">
          <p className="truncate font-semibold text-[#111827]">
            {item.is_pinned && <span className="mr-2 rounded-full bg-warning-50 px-2 py-0.5 text-12 text-warning-600">置顶</span>}
            {item.title}
          </p>
          <p className="mt-1 truncate text-12 text-[#8e99aa]">{item.content}</p>
        </div>
      ),
    },
    {
      key: "tag",
      title: "标签",
      width: 140,
      render: item => <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-13 font-semibold text-primary-600">{item.tag}</span>,
    },
    {
      key: "is_published",
      title: "状态",
      width: 130,
      render: item => (
        <button
          disabled={savingStatusId === item.id}
          onClick={event => { event.stopPropagation(); togglePublished(item) }}
          className={"inline-flex h-8 items-center rounded-full px-3 text-13 font-medium disabled:opacity-60 " + (item.is_published ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-500")}
        >
          {item.is_published ? "已发布" : "未发布"}
        </button>
      ),
    },
    {
      key: "published_at",
      title: "发布时间",
      width: 150,
      render: item => <span className="text-[#6b7990]">{dateOnly(item.published_at)}</span>,
    },
    {
      key: "updated_at",
      title: "更新时间",
      width: 180,
      render: item => <span className="text-[#6b7990]">{item.updated_at || "-"}</span>,
    },
    {
      key: "actions",
      title: "操作",
      align: "center",
      width: 240,
      render: item => (
        <div className="admin-action-group">
          <button onClick={event => { event.stopPropagation(); setPreviewTarget(item) }} className="admin-action-button">预览</button>
          <button
            disabled={savingPinnedId === item.id}
            onClick={event => { event.stopPropagation(); togglePinned(item) }}
            className={"admin-action-button " + (item.is_pinned ? "admin-action-button-muted" : "admin-action-button-success")}
          >
            {item.is_pinned ? "取消置顶" : "置顶"}
          </button>
          <button onClick={event => { event.stopPropagation(); openEdit(item) }} className="admin-action-button">编辑</button>
          <button onClick={event => { event.stopPropagation(); setDeleteTarget(item) }} className="admin-action-button admin-action-button-danger">删除</button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 border-b border-[#edf1f6] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
          <div>
            <h1 className="text-24 font-bold text-[#111827]">公告管理</h1>
            <p className="mt-1 text-14 text-[#8e99aa]">维护前台公告内容、标签、排序和发布状态</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex h-11 items-center rounded-[14px] bg-success-50 px-4 text-14 font-semibold text-success-600">已发布 {stats.published}</span>
            <span className="inline-flex h-11 items-center rounded-[14px] bg-gray-100 px-4 text-14 font-semibold text-gray-500">未发布 {stats.draft}</span>
            <button onClick={openCreate} className="inline-flex h-11 items-center justify-center rounded-[14px] bg-primary-500 px-6 text-15 font-semibold text-white shadow-lg shadow-primary-500/20 hover:bg-primary-600">
              新增公告
            </button>
          </div>
        </div>

        {error && <div className="mx-8 mt-5 rounded-[14px] bg-danger-50 px-4 py-3 text-14 text-danger-500">{error}</div>}

        <div className="flex flex-col gap-3 border-b border-[#edf1f6] px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8">
          <SearchBar
            className="w-full md:max-w-[360px]"
            placeholder="搜索标题、标签或内容"
            onSearch={handleSearch}
          />
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleStatusChange(option.value)}
                className={"h-10 rounded-[12px] border px-4 text-14 font-semibold transition-colors " + (statusFilter === option.value ? "border-primary-500 bg-primary-50 text-primary-600" : "border-[#dfe6ef] bg-white text-[#4f5b70] hover:border-primary-300")}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Table columns={columns} dataSource={items} rowKey="id" loading={loading} emptyText="暂无公告数据" onRowClick={setPreviewTarget} />

        <div className="flex flex-col gap-3 border-t border-[#edf1f6] px-5 py-5 text-14 text-[#6b7990] md:flex-row md:items-center md:justify-between md:px-8">
          <span>共 {total} 条公告，第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">上一页</button>
            <button disabled={page >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>

      <AnnouncementFormModal open={formOpen} announcement={editing} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={handleSaved} />

      <Modal open={!!previewTarget} onClose={() => setPreviewTarget(null)} title="公告预览" className="md:max-w-2xl">
        {previewTarget && (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-13 font-semibold text-primary-600">{previewTarget.tag}</span>
                <span className={"rounded-full px-3 py-1 text-13 font-medium " + (previewTarget.is_published ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-500")}>
                  {previewTarget.is_published ? "已发布" : "未发布"}
                </span>
                {previewTarget.is_pinned && <span className="rounded-full bg-warning-50 px-3 py-1 text-13 font-medium text-warning-600">首页置顶</span>}
                <span className="text-13 text-[#8e99aa]">排序 {previewTarget.sort_order}</span>
              </div>
              <h2 className="mt-4 text-22 font-bold text-[#111827]">{previewTarget.title}</h2>
              <p className="mt-2 text-13 text-[#8e99aa]">发布时间：{previewTarget.published_at || "-"}　更新时间：{previewTarget.updated_at || "-"}</p>
            </div>
            <div className="whitespace-pre-wrap rounded-[16px] bg-[#f8fafe] px-5 py-4 text-15 leading-7 text-[#3f495b]">
              {previewTarget.content}
            </div>
            <div className="flex justify-end gap-3 border-t border-[#edf1f6] pt-5">
              <button onClick={() => { setEditing(previewTarget); setPreviewTarget(null); setFormOpen(true) }} className="h-11 rounded-[12px] bg-primary-500 px-6 text-14 font-semibold text-white hover:bg-primary-600">编辑公告</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除公告"
        message={deleteTarget ? `确定删除「${deleteTarget.title}」吗？删除后前台将不再显示。` : ""}
        confirmText="删除"
        danger
        loading={deleting}
      />
    </div>
  )
}
