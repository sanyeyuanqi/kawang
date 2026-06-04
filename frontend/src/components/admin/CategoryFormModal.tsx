import { useEffect, useState } from "react"
import api from "@/api/client"
import { Modal } from "@/components/ui/Modal"

interface CategoryFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const emptyForm = { name: "", subtitle: "", sort_order: "0" }

export default function CategoryFormModal({ open, onClose, onSaved }: CategoryFormModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setForm(emptyForm)
      setError("")
    }
  }, [open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      await api.post("/admin/categories", {
        name: form.name.trim(),
        subtitle: form.subtitle.trim() || null,
        sort_order: Number(form.sort_order || 0),
      })
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.msg || "分类保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="新增分类">
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>分类名称</span>
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" placeholder="例如：会员卡券" />
        </label>
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>副标题</span>
          <input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" placeholder="例如：视频/音乐/网盘" />
        </label>
        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>排序号</span>
          <input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} className="h-12 w-full rounded-[12px] border border-[#dfe6ef] px-4 outline-none focus:border-primary-500" />
        </label>
        {error && <p className="rounded-[12px] bg-danger-50 px-4 py-3 text-13 text-danger-500">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-[#edf1f6] pt-5">
          <button type="button" onClick={onClose} className="h-11 rounded-[12px] border border-[#dfe6ef] px-6 text-14 font-semibold text-[#4f5b70]">取消</button>
          <button disabled={saving} className="h-11 rounded-[12px] bg-primary-500 px-7 text-14 font-semibold text-white disabled:opacity-60">{saving ? "保存中..." : "新增"}</button>
        </div>
      </form>
    </Modal>
  )
}
