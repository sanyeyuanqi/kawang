import { useEffect, useState } from "react"
import api from "@/api/client"
import { Modal } from "@/components/ui/Modal"

export interface AdminAnnouncementItem {
  id: number
  title: string
  tag: string
  content: string
  sort_order: number
  is_published: boolean
  is_pinned: boolean
  published_at: string | null
  created_at: string | null
  updated_at: string | null
}

interface Props {
  open: boolean
  announcement?: AdminAnnouncementItem | null
  onClose: () => void
  onSaved: () => void
}

const emptyForm = {
  title: "",
  tag: "店铺公告",
  content: "",
  sort_order: "0",
  is_published: true,
}

export default function AnnouncementFormModal({ open, announcement, onClose, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setForm(announcement ? {
      title: announcement.title,
      tag: announcement.tag,
      content: announcement.content,
      sort_order: String(announcement.sort_order),
      is_published: announcement.is_published,
    } : emptyForm)
    setError("")
  }, [open, announcement])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    const payload = {
      title: form.title.trim(),
      tag: form.tag.trim(),
      content: form.content.trim(),
      sort_order: Number(form.sort_order || 0),
      is_published: form.is_published,
    }
    try {
      if (announcement) await api.put(`/admin/announcements/${announcement.id}`, payload)
      else await api.post("/admin/announcements", payload)
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.msg || "公告保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={announcement ? "编辑公告" : "新增公告"} className="md:max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>公告标题</span>
          <input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" placeholder="请输入公告标题" />
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
            <span>公告标签</span>
            <input required maxLength={50} value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" placeholder="例如：服务状态" />
          </label>
          <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
            <span>排序号</span>
            <input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" />
          </label>
        </div>
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>公告内容</span>
          <textarea required rows={7} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className="w-full resize-y rounded-[12px] border border-[#dfe6ef] px-4 py-3 leading-6 outline-none focus:border-primary-500" placeholder="请输入公告正文" />
        </label>
        <label className="announcement-publish-option flex items-center gap-3 rounded-[8px] border border-[#e4e9f1] bg-[#f8fafe] px-4 py-3 text-14 font-medium text-[#3f495b]">
          <input type="checkbox" checked={form.is_published} onChange={(event) => setForm({ ...form, is_published: event.target.checked })} className="size-4 accent-primary-500" />
          保存后立即发布到前台
        </label>
        {error && <p className="rounded-[12px] bg-danger-50 px-4 py-3 text-13 text-danger-500">{error}</p>}
        <div className="announcement-form-footer flex justify-end gap-3 border-t border-[#edf1f6] pt-5">
          <button type="button" onClick={onClose} className="announcement-cancel-button h-11 rounded-[8px] border border-[#dfe6ef] px-6 text-14 font-semibold text-[#4f5b70]">取消</button>
          <button disabled={saving} className="h-11 rounded-[12px] bg-primary-500 px-7 text-14 font-semibold text-white disabled:opacity-60">{saving ? "保存中..." : "保存"}</button>
        </div>
      </form>
    </Modal>
  )
}
