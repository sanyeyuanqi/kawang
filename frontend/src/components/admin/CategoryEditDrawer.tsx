import { useEffect, useState } from "react"
import api from "@/api/client"
import { Drawer } from "@/components/ui/Drawer"

export interface AdminCategoryItem {
  id: number
  name: string
  subtitle: string | null
  sort_order: number
  is_active: boolean
  product_count: number
  updated_at?: string | null
}

interface CategoryEditDrawerProps {
  open: boolean
  category: AdminCategoryItem | null
  onClose: () => void
  onSaved: () => void
}

export default function CategoryEditDrawer({ open, category, onClose, onSaved }: CategoryEditDrawerProps) {
  const [form, setForm] = useState({ name: "", subtitle: "", sort_order: "0", is_active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || !category) return
    setForm({
      name: category.name,
      subtitle: category.subtitle || "",
      sort_order: String(category.sort_order),
      is_active: category.is_active,
    })
    setError("")
  }, [open, category])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!category) return
    setSaving(true)
    setError("")
    try {
      await api.put(`/admin/categories/${category.id}`, {
        name: form.name.trim(),
        subtitle: form.subtitle.trim() || null,
        sort_order: Number(form.sort_order || 0),
        is_active: form.is_active,
      })
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.msg || "分类保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="编辑分类" width="420px">
      <form onSubmit={submit} className="space-y-5">
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>分类名称</span>
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" />
        </label>
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>副标题</span>
          <input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" />
        </label>
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>排序号</span>
          <input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" />
        </label>
        <label className="flex items-center justify-between rounded-[14px] border border-[#dfe6ef] px-4 py-4 text-14 font-medium text-[#3f495b]">
          <span>上架状态</span>
          <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} className="h-5 w-5 accent-[#2562eb]" />
        </label>
        {error && <p className="rounded-[12px] bg-danger-50 px-4 py-3 text-13 text-danger-500">{error}</p>}
        <button disabled={saving} className="h-12 w-full rounded-[14px] bg-primary-500 text-14 font-semibold text-white disabled:opacity-60">
          {saving ? "保存中..." : "保存分类"}
        </button>
      </form>
    </Drawer>
  )
}
