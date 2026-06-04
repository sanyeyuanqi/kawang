import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import api from "@/api/client"
import { CodeBox } from "@/components/shop/CodeBox"
import { EmptyState } from "@/components/ui/EmptyState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { useLanguage } from "@/context/LanguageContext"

interface OrderResult { order_no: string; status: string; total_amount: string; product_name: string; quantity: number; codes: { id: number; code_value: string }[]; paid_at: string | null }
interface ApiResponse<T> { code: number; msg: string; data: T }

export default function SuccessPage() {
  const { st } = useLanguage()
  const { orderNo } = useParams<{ orderNo: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!orderNo) return
    api.get<ApiResponse<OrderResult>>("/orders/" + orderNo + "/result").then(r => { setOrder(r.data.data); setLoading(false) }).catch(() => setLoading(false))
  }, [orderNo])

  const copyAll = async () => {
    if (!order) return
    const text = order.codes.map(c => c.code_value).join(String.fromCharCode(10))
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" label={st("订单结果加载中")} /></div>
  if (!order || order.status !== "paid") {
    return (
      <EmptyState
        className="min-h-screen"
        title={st("订单未支付或不存在")}
        description={st("可以返回订单查询页，用订单号或联系方式重新查询。")}
        action={{ label: st("查询订单"), onClick: () => navigate("/orders/query") }}
      />
    )
  }

  return (
    <div className="mx-auto min-h-[100svh] w-full max-w-[430px] bg-[#f8fafc] pb-32 md:max-w-none">
      <div className="relative h-[253px] bg-[#0e4beb] px-7 pt-[78px] text-white md:flex md:flex-col md:items-center md:justify-center md:px-4 md:py-12" style={{ minHeight: 214 }}>
        <div className="absolute right-10 top-[84px] flex size-[60px] items-center justify-center rounded-full bg-white md:static md:mb-4 md:size-[50px] md:bg-white/20">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M7 13l3 3 7-7" stroke="#0E4AEB" className="md:stroke-white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h1 className="text-[32px] font-bold leading-none md:text-30">{st("支付成功")}</h1>
        <p className="mt-3 text-[17px] text-[#D1E0FF] md:text-14">{st("订单已自动发卡，请及时保存卡密")}</p>
      </div>

      <div className="mx-auto -mt-[54px] max-w-[430px] px-7 md:max-w-md md:px-4">
        <div className="rounded-[22px] border border-[#dfe5ed] bg-white p-7 shadow-[0_18px_42px_-18px_rgba(10,18,31,0.16)]">
          <div className="mb-7 flex items-center justify-between">
            <h2 className="text-[24px] font-bold text-[#0e131e]">{st("你的卡密")}</h2>
            <span className="rounded-full bg-[#e8faf4] px-4 py-2 text-[13px] font-medium text-success-500">{st("已发卡")}</span>
          </div>

          <CodeBox codes={order.codes.map(c => c.code_value)} />

          <button onClick={copyAll} className="mx-auto mt-7 block h-[52px] w-[156px] rounded-[14px] bg-primary-500 text-[16px] font-medium text-white transition-colors hover:bg-primary-600">
            {copied ? st("已复制") : st("复制卡密")}
          </button>
        </div>

        <div className="mt-12">
          <h3 className="mb-5 text-[22px] font-bold text-[#0e131e]">{st("使用说明")}</h3>
          <ol className="space-y-5 rounded-[20px] border border-[#dfe5ed] bg-white px-7 py-8 text-[17px] leading-none text-[#0e131e]">
            <li>{st("1. 打开对应平台兑换入口")}</li>
            <li>{st("2. 输入上方卡密完成兑换")}</li>
            <li>{st("3. 有问题可凭订单号联系客服")}</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
