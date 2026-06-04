import { useEffect, useState } from "react"
import api from "@/api/client"
import { ImageUpload } from "@/components/ui/ImageUpload"
import { Modal } from "@/components/ui/Modal"

export interface AdminCategoryOption {
  id: number
  name: string
}

export interface AdminProductItem {
  id: number
  category_id: number | null
  category_name?: string | null
  name: string
  description: string | null
  cover_image?: string | null
  price: string
  sort_order: number
  stock: number
  available_stock: number
  status: "on_sale" | "sold_out"
  updated_at?: string | null
}

interface ProductFormState {
  name: string
  category_id: string
  description: string
  price: string
  sort_order: string
  cover_image: string
}

interface ProductFormModalProps {
  open: boolean
  product: AdminProductItem | null
  categories: AdminCategoryOption[]
  onClose: () => void
  onSaved: () => void
}

const emptyForm: ProductFormState = {
  name: "",
  category_id: "",
  description: "",
  price: "",
  sort_order: "0",
  cover_image: "",
}

export default function ProductFormModal({ open, product, categories, onClose, onSaved }: ProductFormModalProps) {
  const [form, setForm] = useState<ProductFormState>(emptyForm)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (product) {
      setForm({
        name: product.name,
        category_id: product.category_id ? String(product.category_id) : "",
        description: product.description || "",
        price: product.price,
        sort_order: String(product.sort_order),
        cover_image: product.cover_image || "",
      })
    } else {
      setForm(emptyForm)
    }
    setError("")
  }, [open, product])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError("")
    try {
      const data = new FormData()
      data.append("file", file)
      const res = await api.post("/admin/upload", data, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setForm((prev) => ({ ...prev, cover_image: res.data.data.url }))
    } catch (err: any) {
      setError(err.response?.data?.msg || "图片上传失败")
    } finally {
      setUploading(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      description: form.description.trim() || null,
      cover_image: form.cover_image || null,
      price: form.price,
      sort_order: Number(form.sort_order || 0),
    }

    try {
      if (product) await api.put(`/admin/products/${product.id}`, payload)
      else await api.post("/admin/products", payload)
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.msg || "商品保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={product ? "编辑商品" : "新增商品"} className="md:max-w-[680px]">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-14 font-medium text-[#3f495b]">
            <span>商品名称</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              className="h-12 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 text-14 outline-none focus:border-primary-500"
              placeholder="例如：视频会员月卡"
            />
          </label>
          <label className="space-y-2 text-14 font-medium text-[#3f495b]">
            <span>售价</span>
            <input
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              required
              className="h-12 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 text-14 outline-none focus:border-primary-500"
              placeholder="18.80"
            />
          </label>
          <label className="space-y-2 text-14 font-medium text-[#3f495b]">
            <span>商品分类</span>
            <select
              value={form.category_id}
              onChange={(event) => setForm({ ...form, category_id: event.target.value })}
              className="h-12 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 text-14 outline-none focus:border-primary-500"
            >
              <option value="">未分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-14 font-medium text-[#3f495b]">
            <span>排序</span>
            <input
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
              className="h-12 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 text-14 outline-none focus:border-primary-500"
              placeholder="0"
            />
          </label>
        </div>

        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>商品描述</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="min-h-[112px] w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 py-3 text-14 outline-none focus:border-primary-500"
            placeholder="填写前台展示的商品说明"
          />
        </label>

        <div className="space-y-2 text-14 font-medium text-[#3f495b]">
          <span>封面图</span>
          <ImageUpload
            value={form.cover_image}
            onChange={handleUpload}
            onRemove={() => setForm((prev) => ({ ...prev, cover_image: "" }))}
          />
          {uploading && <p className="text-12 text-[#6b7990]">图片上传中...</p>}
        </div>

        {error && <p className="rounded-[12px] bg-danger-50 px-4 py-3 text-13 text-danger-500">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-[#edf1f6] pt-5">
          <button type="button" onClick={onClose} className="h-11 rounded-[12px] border border-[#dfe6ef] px-6 text-14 font-semibold text-[#4f5b70] hover:bg-[#f8fbff]">
            取消
          </button>
          <button disabled={saving || uploading} className="h-11 rounded-[12px] bg-primary-500 px-7 text-14 font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
