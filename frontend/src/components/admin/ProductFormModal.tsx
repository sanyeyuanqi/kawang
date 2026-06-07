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
  usage_instructions?: string | null
  cover_image?: string | null
  price: string
  product_type?: "auto_delivery" | "preorder"
  preorder_stock?: number
  sort_order: number
  sold_count: number
  stock: number
  available_stock: number
  status: "on_sale" | "sold_out"
  updated_at?: string | null
}

interface ProductFormState {
  name: string
  category_id: string
  description: string
  usage_instructions: string
  price: string
  product_type: "auto_delivery" | "preorder"
  preorder_stock: string
  sort_order: string
  sold_count: string
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
  usage_instructions: "",
  price: "",
  product_type: "auto_delivery",
  preorder_stock: "0",
  sort_order: "0",
  sold_count: "0",
  cover_image: "",
}

function getFormErrorMessage(err: any, fallback: string) {
  const data = err.response?.data
  if (data?.msg) return data.msg
  const detail = data?.detail
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg.replace(/^Value error,\s*/, "")
  }
  return fallback
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
        usage_instructions: product.usage_instructions || "",
        price: product.price,
        product_type: product.product_type || "auto_delivery",
        preorder_stock: String(product.preorder_stock ?? product.available_stock ?? 0),
        sort_order: String(product.sort_order),
        sold_count: String(product.sold_count ?? 0),
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
      setError(getFormErrorMessage(err, "图片上传失败"))
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
      usage_instructions: form.usage_instructions.trim() || null,
      cover_image: form.cover_image || null,
      price: form.price,
      product_type: form.product_type,
      preorder_stock: form.product_type === "preorder" ? Number(form.preorder_stock || 0) : 0,
      sort_order: Number(form.sort_order || 0),
      sold_count: Number(form.sold_count || 0),
    }

    try {
      if (product) await api.put(`/admin/products/${product.id}`, payload)
      else await api.post("/admin/products", payload)
      onSaved()
    } catch (err: any) {
      setError(getFormErrorMessage(err, "商品保存失败"))
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
            <span>商品类型</span>
            <select
              value={form.product_type}
              onChange={(event) => setForm({ ...form, product_type: event.target.value as ProductFormState["product_type"] })}
              className="h-12 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 text-14 outline-none focus:border-primary-500"
            >
              <option value="auto_delivery">自动发货</option>
              <option value="preorder">提前抢购</option>
            </select>
          </label>
          {form.product_type === "preorder" && (
            <label className="space-y-2 text-14 font-medium text-[#3f495b]">
              <span>自定义库存</span>
              <input
                type="number"
                min={0}
                value={form.preorder_stock}
                onChange={(event) => setForm({ ...form, preorder_stock: event.target.value })}
                className="h-12 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 text-14 outline-none focus:border-primary-500"
                placeholder="0"
              />
            </label>
          )}
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
          <label className="space-y-2 text-14 font-medium text-[#3f495b]">
            <span>已售数量</span>
            <input
              type="number"
              min={0}
              value={form.sold_count}
              onChange={(event) => setForm({ ...form, sold_count: event.target.value })}
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

        <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
          <span>使用说明</span>
          <textarea
            value={form.usage_instructions}
            onChange={(event) => setForm({ ...form, usage_instructions: event.target.value })}
            className="min-h-[96px] w-full rounded-[12px] border border-[#dfe6ef] bg-white px-4 py-3 text-14 outline-none focus:border-primary-500"
            placeholder="填写使用说明网址或文字教程"
          />
        </label>

        <div className="space-y-2 text-14 font-medium text-[#3f495b]">
          <span>封面图</span>
          <ImageUpload
            value={form.cover_image}
            onChange={handleUpload}
            onRemove={() => setForm((prev) => ({ ...prev, cover_image: "" }))}
            previewClassName="aspect-video"
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
