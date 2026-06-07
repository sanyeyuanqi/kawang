import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { QRCodeSVG } from "qrcode.react"
import { ErrorState } from "@/components/ui/ErrorState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { useLanguage } from "@/context/LanguageContext"
import { useOrderPaymentMonitor } from "@/hooks/useOrderPaymentMonitor"

interface PayInfo {
  pay_type: number; html_form?: string; qr_url?: string; qr_content?: string
}
export default function PayPage() {
  const { st } = useLanguage()
  const { orderNo } = useParams<{ orderNo: string }>()
  const navigate = useNavigate()
  const [payInfo, setPayInfo] = useState<PayInfo | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "polling" | "paid" | "timeout">("loading")
  const [error, setError] = useState("")
  const paidHandledRef = useRef(false)
  const cashierUrl = payInfo?.qr_content || payInfo?.qr_url

  useEffect(() => {
    if (!orderNo) return
    const stored = sessionStorage.getItem("pay_info_" + orderNo)
    if (stored) { setPayInfo(JSON.parse(stored)); setStatus("ready") }
    else { setError(st("支付信息缺失，请重新下单")) }
  }, [orderNo])

  useEffect(() => {
    if (status === "ready" && payInfo?.pay_type === 0 && payInfo.html_form) {
      const container = document.getElementById("alipay-form")
      if (container) { container.innerHTML = payInfo.html_form; const form = container.querySelector("form"); if (form) setTimeout(() => form.submit(), 200) }
    }
  }, [status, payInfo])

  useOrderPaymentMonitor({
    orderNo,
    enabled: status === "ready" || status === "polling",
    onPaid: () => {
      if (paidHandledRef.current) return
      paidHandledRef.current = true
      setStatus("paid")
      setTimeout(() => navigate("/orders/" + orderNo + "/success"), 1500)
    },
    onCancelled: () => {
      setStatus("timeout")
      setError(st("订单已取消，如已付款请联系客服处理"))
    },
    onTimeout: () => setStatus("timeout"),
  })

  if (status === "loading") return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" label={st("支付信息加载中")} /></div>
  if (error) return <ErrorState className="min-h-screen" message={error} onRetry={() => navigate("/orders/query")} />

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-22 font-bold mb-2">{st("订单支付")}</h1>
      <p className="text-14 text-gray-500 mb-6">{st("订单号")}: {orderNo}</p>

      {payInfo?.html_form && <div><div id="alipay-form" className="hidden" /><p className="text-gray-500">{st("正在跳转到收银台...")}</p></div>}

      {cashierUrl && (
        <div className="bg-white p-6 rounded-2xl shadow-md flex flex-col items-center">
          <p className="text-14 text-gray-700 mb-4">{st("请扫码或打开收银台完成支付")}</p>
          <QRCodeSVG value={cashierUrl} size={200} />
          <a href={cashierUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center rounded-lg bg-black px-5 text-14 font-semibold text-white">
            {st("打开收银台")}
          </a>
          <p className="text-12 text-gray-400 mt-4">{st("支付后自动跳转，请勿关闭页面")}</p>
        </div>
      )}

      {(status === "ready" || status === "polling") && <p className="text-14 text-gray-400 mt-6">{st("等待支付确认中...")}</p>}
      {status === "paid" && <div className="mt-6 text-success-500 font-semibold text-16">{st("支付成功！正在跳转...")}</div>}
      {status === "timeout" && <div className="mt-6 text-warning-500 text-14">{st("支付确认超时，可在订单查询页查看最新状态")}</div>}
    </div>
  )
}
