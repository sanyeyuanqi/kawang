import { useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/api/client"
import { useLanguage } from "@/context/LanguageContext"

interface Props {
  isOpen: boolean; onClose: () => void
  product: { id: number; name: string; price: string }
}

function getOrderErrorMessage(err: any) {
  return err.response?.data?.detail?.msg || err.response?.data?.msg || "下单失败，请重试"
}

export default function OrderConfirmModal({ isOpen, onClose, product }: Props) {
  const { st } = useLanguage()
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(1)
  const [contactInfo, setContactInfo] = useState("")
  const [payType, setPayType] = useState<0 | 1>(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  if (!isOpen) return null

  const total = (parseFloat(product.price) * quantity).toFixed(2)

  const handleSubmit = async () => {
    if (contactInfo.length < 6) { setError(st("联系方式至少 6 个字符")); return }
    setError("")
    setSubmitting(true)
    try {
      const r = await api.post("/orders", { product_id: product.id, quantity, contact_info: contactInfo, pay_type: payType })
      const d = r.data.data
      sessionStorage.setItem("pay_info_" + d.order_no, JSON.stringify(d.pay_info))
      navigate("/orders/" + d.order_no + "/pay")
    } catch (err: any) {
      setError(st(getOrderErrorMessage(err)))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm mx-4 p-6 shadow-xl animate-scale-in">
        <h2 className="text-17 font-semibold mb-1">{product.name}</h2>
        <p className="text-14 text-gray-500 mb-4">{st("单价")}: {product.price} {st("元")}</p>

        <div className="flex items-center justify-between mb-4">
          <span className="text-14 text-gray-600">{st("数量")}</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-18 font-medium">-</button>
            <span className="text-17 font-semibold w-6 text-center">{quantity}</span>
            <button onClick={() => setQuantity(quantity + 1)} className="w-9 h-9 rounded-full bg-primary-500 text-white flex items-center justify-center text-18 font-medium">+</button>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-14 text-gray-600 mb-1 block">{st("联系方式")}</label>
          <input type="text" value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder={st("手机号 / 邮箱 / 微信号")} className="w-full h-11 px-4 rounded-lg bg-gray-100 border border-gray-200 text-14 outline-none focus:border-primary-500" />
        </div>

        <div className="mb-4">
          <label className="text-14 text-gray-600 mb-1 block">{st("支付方式")}</label>
          <div className="flex gap-2">
            <button onClick={() => setPayType(0)} className={"flex-1 h-10 rounded-lg text-13 font-medium " + (payType === 0 ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-600")}>{st("支付宝")}</button>
            <button onClick={() => setPayType(1)} className={"flex-1 h-10 rounded-lg text-13 font-medium " + (payType === 1 ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-600")}>{st("微信支付")}</button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 pt-2 border-t border-gray-100">
          <span className="text-14 text-gray-600">{st("合计")}</span>
          <span className="text-22 font-bold text-danger-500">{total} {st("元")}</span>
        </div>

        {error && <p className="text-12 text-danger-500 mb-2">{error}</p>}

        <button onClick={handleSubmit} disabled={submitting} className="w-full h-11 bg-primary-500 text-white rounded-lg font-medium text-15 disabled:opacity-50">
          {submitting ? st("处理中...") : st("确认支付")}
        </button>
        <button onClick={onClose} disabled={submitting} className="mt-2 w-full h-10 text-gray-500 rounded-lg font-medium text-14 hover:bg-gray-100 disabled:opacity-50">
          {st("取消")}
        </button>
      </div>
    </div>
  )
}
