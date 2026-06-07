import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { QRCodeSVG } from "qrcode.react"
import api from "@/api/client"
import { formatPrice } from "@/lib/utils"
import MobilePhoneFrame from "@/components/shop/MobilePhoneFrame"
import { useLanguage } from "@/context/LanguageContext"
import { useOrderPaymentMonitor } from "@/hooks/useOrderPaymentMonitor"

interface OrderRecord {
  order_no: string
  status: string
  total_amount: string
  product_name: string
  product_type?: string
  quantity: number
  contact_info: string
  codes: { id: number; code_value: string }[]
  paid_at: string | null
  created_at: string | null
}

interface PayInfo {
  pay_type: number
  html_form?: string | null
  qr_url?: string | null
  qr_content?: string | null
  haozpay_seq_id?: string | null
}

const PAGE_SIZE = 10

function getStatusMeta(status: string, st: (text: string) => string, productType?: string) {
  const normalized = status?.toLowerCase()
  if (normalized === "paid" && productType === "preorder") return { label: st("待发货"), className: "bg-[#fff6df] text-[#f09e1f] border-[#ffe5ad]" }
  if (normalized === "paid" || status === "已支付") return { label: st("已支付"), className: "bg-[#e8faf4] text-[#08a678] border-[#c9f0e3]" }
  if (normalized === "pending" || status === "待支付") return { label: st("待支付"), className: "bg-[#fff6df] text-[#f09e1f] border-[#ffe5ad]" }
  if (normalized === "delivered" || status === "已发卡") return { label: st(productType === "preorder" ? "已发货" : "已发卡"), className: "bg-[#e8faf4] text-[#08a678] border-[#c9f0e3]" }
  if (normalized === "cancelled" || normalized === "canceled" || status === "已取消") return { label: st("已取消"), className: "bg-[#f2f5f9] text-[#6b7990] border-[#dfe5ed]" }
  if (normalized === "refunded" || status === "已退款") return { label: st("已退款"), className: "bg-[#f2f5f9] text-[#6b7990] border-[#dfe5ed]" }
  if (normalized === "after_sale" || normalized === "after-sales" || status === "售后中") return { label: st("售后中"), className: "bg-[#ebf2ff] text-[#0e4beb] border-[#cbdcff]" }
  return { label: status || st("未知状态"), className: "bg-[#f2f5f9] text-[#6b7990] border-[#dfe5ed]" }
}

function canViewOrderDetail(status: string) {
  const normalized = status?.toLowerCase()
  return normalized === "paid" || normalized === "delivered" || status === "已支付" || status === "已发卡"
}

function isPendingOrder(status: string) {
  const normalized = status?.toLowerCase()
  return normalized === "pending" || status === "待支付"
}

function getErrorMessage(err: any, fallback: string) {
  const detail = err.response?.data?.detail
  if (typeof detail === "string") return detail
  return detail?.msg || err.response?.data?.msg || fallback
}

function PayDialog({
  order,
  payInfo,
  cashierUrl,
  loading,
  error,
  status,
  st,
  onClose,
}: {
  order: OrderRecord
  payInfo: PayInfo | null
  cashierUrl?: string | null
  loading: boolean
  error: string
  status: "idle" | "ready" | "polling" | "paid" | "timeout"
  st: (text: string) => string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1220]/65 px-5 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-[430px] rounded-[24px] bg-[#101827] p-6 text-white shadow-[0_28px_70px_-24px_rgba(10,18,31,0.55)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-[#172235] text-[20px] leading-none text-[#7f8fa8] hover:bg-[#1f2d44] hover:text-white"
          aria-label={st("关闭支付弹层")}
        >
          ×
        </button>

        <div className="pr-8">
          <h2 className="text-[22px] font-bold text-white">{st("扫码完成支付")}</h2>
          <p className="mt-2 text-[14px] text-[#b8c6da]">{st("请使用收银台二维码完成付款")}</p>
        </div>

        <div className="mx-auto mt-6 flex size-[244px] items-center justify-center rounded-[18px] border border-white/75 bg-white p-4 shadow-[0_12px_30px_-20px_rgba(10,18,31,0.35)]">
          {cashierUrl ? (
            <QRCodeSVG value={cashierUrl} size={210} />
          ) : status === "paid" ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[12px] bg-[#f3f6fb] text-[#08a678]">
              <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-[#c9f0e3] text-[34px] leading-none">✓</span>
              <span className="text-[14px] font-semibold">{st("支付成功")}</span>
            </div>
          ) : loading ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[12px] bg-[#f3f6fb] text-[#64748b]">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#d8e1ec] border-t-[#0e4beb]" />
              <span className="text-[14px] font-semibold">{st("正在生成二维码...")}</span>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[12px] bg-[#f3f6fb] px-5 text-center text-[#64748b]">
              <span className="text-[14px] font-semibold">{error || st("支付信息加载失败，请稍后重试")}</span>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-[14px] bg-[#f7f9fc] px-4 py-3">
          <p className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-[#64748b]">
            <span className="shrink-0 text-[13px]">{st("订单号：")}</span>
            <span className="shrink-0 text-[13px] font-semibold text-[#475569]" title={order.order_no}>{order.order_no}</span>
          </p>
          <p className="mt-1 text-[13px] text-[#64748b]">{st("金额：")}{formatPrice(order.total_amount)}</p>
        </div>

        {payInfo?.html_form && <div id={`query-alipay-form-${order.order_no}`} className="hidden" />}

        {cashierUrl && (
          <a href={cashierUrl} target="_blank" rel="noreferrer" className="mt-5 flex h-11 w-full items-center justify-center rounded-[12px] bg-black text-[15px] font-semibold text-white">
            {st("打开收银台")}
          </a>
        )}

        {loading && <p className="mt-4 text-center text-[13px] text-[#cbd5e1]">{st("正在生成二维码...")}</p>}
        {(status === "ready" || status === "polling") && <p className="mt-4 text-center text-[13px] text-[#cbd5e1]">{st("等待支付确认中...")}</p>}
        {status === "paid" && <p className="mt-4 text-center text-[14px] font-semibold text-[#08a678]">{st("支付成功！正在跳转...")}</p>}
        {status === "timeout" && <p className="mt-4 text-center text-[13px] text-[#f09e1f]">{error || st("支付确认超时，可在订单查询页查看最新状态")}</p>}
      </div>
    </div>
  )
}

export default function OrderQueryPage() {
  const { st } = useLanguage()
  const navigate = useNavigate()
  const [contactInfo, setContactInfo] = useState("")
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [offset, setOffset] = useState(0)
  const [afterId, setAfterId] = useState(0)
  const [afterCreatedAt, setAfterCreatedAt] = useState<string | null>(null)
  const [hasMoreOrders, setHasMoreOrders] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [searched, setSearched] = useState(false)
  const [activePayOrderNo, setActivePayOrderNo] = useState<string | null>(null)
  const [payInfo, setPayInfo] = useState<PayInfo | null>(null)
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState("")
  const [payStatus, setPayStatus] = useState<"idle" | "ready" | "polling" | "paid" | "timeout">("idle")
  const [cancellingOrderNo, setCancellingOrderNo] = useState<string | null>(null)
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const desktopLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const paidHandledRef = useRef(false)

  const hasMore = searched && hasMoreOrders
  const cashierUrl = payInfo?.qr_content || payInfo?.qr_url

  const parseOrderPayload = (data: any) => {
    if (Array.isArray(data)) {
      return { items: data as OrderRecord[], total: data.length, offset: 0, limit: data.length || PAGE_SIZE, hasMore: false, nextCursor: 0, nextCursorCreatedAt: null }
    }
    return {
      items: (data?.items || []) as OrderRecord[],
      total: Number(data?.total || 0),
      offset: Number(data?.offset || 0),
      limit: Number(data?.limit || PAGE_SIZE),
      hasMore: Boolean(data?.has_more),
      nextCursor: Number(data?.next_cursor || data?.after_cursor || 0),
      nextCursorCreatedAt: data?.next_cursor_created_at || data?.after_cursor_created_at || null,
    }
  }

  const loadOrdersPage = async (nextOffset: number, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const res = await api.post("/orders/query", {
        contact_info: contactInfo.trim(),
        offset: nextOffset,
        after_id: append ? afterId : 0,
        after_created_at: append ? afterCreatedAt : undefined,
        limit: PAGE_SIZE,
      })
      const payload = parseOrderPayload(res.data.data)
      setOrders(prev => append ? [...prev, ...payload.items] : payload.items)
      setOffset(payload.offset + payload.items.length)
      setAfterId(payload.nextCursor)
      setAfterCreatedAt(payload.nextCursorCreatedAt)
      setHasMoreOrders(payload.hasMore)
    } catch (err: any) {
      setError(err.response?.data?.msg || st("查询失败，请稍后重试"))
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }

  const query = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setActivePayOrderNo(null)
    setPayInfo(null)
    setPayError("")
    setPayStatus("idle")
    if (!contactInfo.trim()) {
      setSearched(false)
      setOrders([])
      setOffset(0)
      setAfterId(0)
      setAfterCreatedAt(null)
      setHasMoreOrders(false)
      setError(st("请输入联系方式 / 订单号"))
      return
    }
    setSearched(true)
    setOrders([])
    setOffset(0)
    setAfterId(0)
    setAfterCreatedAt(null)
    setHasMoreOrders(false)
    await loadOrdersPage(0)
  }

  const openPayPanel = async (order: OrderRecord) => {
    if (activePayOrderNo === order.order_no && payInfo) return
    paidHandledRef.current = false
    setActivePayOrderNo(order.order_no)
    setPayInfo(null)
    setPayError("")
    setPayStatus("idle")
    setPayLoading(true)

    try {
      const cached = sessionStorage.getItem(`pay_info_${order.order_no}`)
      if (cached) {
        const parsed = JSON.parse(cached) as PayInfo
        setPayInfo(parsed)
        setPayStatus("ready")
        return
      }

      const response = await api.get<{ code: number; msg: string; data: PayInfo }>(`/orders/${order.order_no}/pay-info`)
      const info = response.data.data
      sessionStorage.setItem(`pay_info_${order.order_no}`, JSON.stringify(info))
      setPayInfo(info)
      setPayStatus("ready")
    } catch (err: any) {
      setPayError(getErrorMessage(err, st("支付信息加载失败，请稍后重试")))
      setPayStatus("idle")
    } finally {
      setPayLoading(false)
    }
  }

  const closePayDialog = () => {
    setActivePayOrderNo(null)
    setPayInfo(null)
    setPayError("")
    setPayStatus("idle")
    setPayLoading(false)
  }

  const cancelOrder = async (order: OrderRecord) => {
    if (cancellingOrderNo) return
    const confirmed = window.confirm(st("确定要取消这个订单吗？"))
    if (!confirmed) return

    setError("")
    setCancellingOrderNo(order.order_no)
    try {
      const response = await api.post<{ code: number; msg: string; data: OrderRecord }>(`/orders/${order.order_no}/cancel`, {
        contact_info: contactInfo.trim(),
      })
      const cancelledOrder = response.data.data
      setOrders(prev => prev.map(item => item.order_no === order.order_no ? { ...item, ...cancelledOrder } : item))
      sessionStorage.removeItem(`pay_info_${order.order_no}`)
      if (activePayOrderNo === order.order_no) closePayDialog()
    } catch (err: any) {
      setError(getErrorMessage(err, st("取消订单失败，请稍后重试")))
    } finally {
      setCancellingOrderNo(null)
    }
  }

  useEffect(() => {
    if (payStatus === "ready" && payInfo?.pay_type === 0 && payInfo.html_form) {
      const container = document.getElementById(`query-alipay-form-${activePayOrderNo}`)
      if (!container) return
      container.innerHTML = payInfo.html_form
      const form = container.querySelector("form")
      if (form) setTimeout(() => form.submit(), 200)
    }
  }, [activePayOrderNo, payInfo, payStatus])

  useOrderPaymentMonitor({
    orderNo: activePayOrderNo || undefined,
    enabled: Boolean(activePayOrderNo) && (payStatus === "ready" || payStatus === "polling"),
    onPaid: () => {
      if (!activePayOrderNo || paidHandledRef.current) return
      paidHandledRef.current = true
      setPayStatus("paid")
      setTimeout(() => navigate(`/orders/${activePayOrderNo}/success`), 900)
    },
    onCancelled: () => {
      setPayStatus("timeout")
      setPayError(st("订单已取消，如已付款请联系客服处理"))
    },
    onTimeout: () => setPayStatus("timeout"),
    onError: () => setPayStatus((current) => current === "ready" ? "polling" : current),
  })

  useEffect(() => {
    const targets = [mobileLoadMoreRef.current, desktopLoadMoreRef.current].filter(Boolean) as HTMLDivElement[]
    if (targets.length === 0 || !hasMore || loading || loadingMore) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting) && hasMore && !loading && !loadingMore) {
        loadOrdersPage(offset, true)
      }
    }, { rootMargin: "260px 0px" })

    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, offset])

  const visibleOrders = searched ? orders : []
  const activePayOrder = activePayOrderNo ? orders.find(order => order.order_no === activePayOrderNo) || null : null

  return (
    <>
      <MobilePhoneFrame className="bg-[#fcfdfe]" contentClassName="px-7 pt-5 pb-32" showHomeIndicator={false}>
        <section className="rounded-[20px] border border-[#dfe5ed] bg-white p-5 shadow-[0_12px_28px_-12px_rgba(10,18,31,0.12)]">
          <form onSubmit={query}>
            <label className="sr-only">{st("查询的联系方式")}</label>
            <input
              value={contactInfo}
              onChange={event => setContactInfo(event.target.value)}
              placeholder={st("联系方式 / 订单号")}
              className="h-[50px] w-full rounded-[14px] border border-[#dfe5ed] bg-[#fafbfd] px-5 text-[16px] text-[#0e131e] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]"
            />
            {error && <p className="mt-2 text-[12px] text-danger-500">{error}</p>}
            <button disabled={loading} className="mt-5 h-[48px] w-full rounded-[13px] bg-[#0e4beb] text-[18px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(10,18,31,0.14)] disabled:opacity-60">
              {loading ? st("查询中...") : st("查询订单")}
            </button>
          </form>
        </section>

        {searched && !loading && orders.length === 0 ? (
          <section className="mt-[70px] rounded-[20px] border border-[#dfe5ed] bg-white p-7 shadow-[0_12px_28px_-12px_rgba(10,18,31,0.12)]">
            <h2 className="text-[22px] font-bold text-[#0e131e]">{st("查询结果")}</h2>
            <p className="mt-5 text-[15px] leading-6 text-[#6b7990]">{st("暂未找到订单，请确认手机号或订单号是否正确。")}</p>
          </section>
        ) : visibleOrders.length > 0 ? (
          <div className="mt-10 space-y-4">
            {visibleOrders.map(order => (
              <section key={order.order_no} className="order-query-primary-card rounded-[20px] border border-[#dfe5ed] bg-white p-6 shadow-[0_12px_28px_-12px_rgba(10,18,31,0.12)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="order-query-card-order-no shrink-0 text-[14px] font-bold text-[#111827]">{st("订单号：")}</span>
                    <span className="order-query-card-order-no min-w-0 flex-1 truncate text-[14px] font-bold text-[#111827]" title={order.order_no}>{order.order_no}</span>
                  </div>
                  <span className={"rounded-full border px-4 py-2 text-[13px] font-medium leading-none " + getStatusMeta(order.status, st, order.product_type).className}>{getStatusMeta(order.status, st, order.product_type).label}</span>
                </div>

                <div className="order-query-divider my-4 h-px bg-[#dbe5f5]" />

                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[13px] font-medium text-[#5c697d]">
                  <span className="shrink-0">{order.paid_at || order.created_at || "-"}</span>
                  <span className="order-query-product-name min-w-0 truncate font-semibold text-[#404a5c]">{order.product_name}</span>
                  <span className="profile-order-quantity shrink-0 rounded-full border border-[#d1def0] bg-[#f6f9fe] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#4f5c70]">x{order.quantity}</span>
                </div>

                <div className="mt-5 flex items-center justify-between gap-4">
                  <p className="shrink-0 text-[24px] font-bold leading-none text-[#e82929]">{formatPrice(order.total_amount)}</p>
                  {canViewOrderDetail(order.status) && (
                    <Link to={`/orders/${order.order_no}/success`} className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[12px] bg-[#0e4beb] px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(14,75,235,0.65)]">
                      {st("查看详情")}
                    </Link>
                  )}
                  {isPendingOrder(order.status) && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => cancelOrder(order)}
                        disabled={cancellingOrderNo === order.order_no}
                        className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[12px] border border-[#d7e0ec] bg-white px-4 text-[15px] font-semibold text-[#5c697d] transition hover:border-[#b8c9e2] hover:bg-[#f8fbff] disabled:opacity-60"
                      >
                        {cancellingOrderNo === order.order_no ? st("取消中...") : st("取消订单")}
                      </button>
                      <button type="button" onClick={() => openPayPanel(order)} className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[12px] bg-[#0e4beb] px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(14,75,235,0.65)]">
                        {st("去支付")}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            ))}
            <div ref={mobileLoadMoreRef} className="min-h-10 text-center text-[13px] font-semibold text-[#6b7990]">
              {loadingMore ? st("加载中...") : hasMore ? st("继续下拉加载更多") : st("已加载全部")}
            </div>
          </div>
        ) : null}
      </MobilePhoneFrame>

      <div className="figma-web-container hidden min-h-[calc(100dvh-clamp(54px,3.38vw,96px))] pb-24 pt-8 md:block md:pt-[clamp(47px,2.96vw,84px)]">
        <div className="order-query-grid">
          <div className="order-query-form-sticky space-y-10 md:space-y-[clamp(23px,1.41vw,40px)]">
            <section className="rounded-[30px] border border-[#dfe5ed] bg-white p-6 shadow-[0_16px_36px_-8px_rgba(10,18,31,0.1)] md:min-h-[clamp(300px,18.5vw,520px)] md:rounded-[clamp(19px,1.2vw,34px)] md:p-[clamp(34px,2.11vw,60px)]">
              <h1 className="text-[26px] font-bold text-[#0e131e] md:text-[clamp(16px,0.99vw,28px)]">{st("查询订单")}</h1>
              <p className="mt-3 text-[16px] leading-7 text-[#6b7990] md:text-[clamp(11px,0.63vw,18px)] md:leading-normal">{st("无需登录，输入订单号或下单时填写的联系方式即可查询。")}</p>
              <form onSubmit={query} className="mt-10 md:mt-[clamp(23px,1.41vw,40px)]">
                <label className="sr-only">{st("联系方式 / 订单号")}</label>
                <input
                  value={contactInfo}
                  onChange={event => setContactInfo(event.target.value)}
                  placeholder={st("联系方式 / 订单号")}
                  className="h-[62px] w-full rounded-[16px] border border-[#dfe5ed] bg-[#fafbfd] px-[22px] text-[16px] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb] md:h-[clamp(35px,2.18vw,62px)] md:rounded-[clamp(9px,0.56vw,16px)] md:px-[clamp(12px,0.77vw,22px)] md:text-[clamp(11px,0.56vw,16px)]"
                />
                <p className="mt-2 min-h-[18px] text-[13px] leading-[18px] text-danger-500">{error}</p>
                <button disabled={loading} className="mt-3 h-[56px] w-full rounded-[14px] bg-[#0e4beb] text-[16px] font-medium text-white shadow-[0_8px_22px_-8px_rgba(10,18,31,0.14)] disabled:opacity-60 md:mt-[clamp(8px,0.49vw,14px)] md:h-[clamp(32px,1.97vw,56px)] md:rounded-[clamp(8px,0.49vw,14px)] md:text-[clamp(11px,0.56vw,16px)]">
                  {loading ? st("查询中...") : st("查询订单")}
                </button>
              </form>
            </section>
          </div>

          <section className="min-h-[520px] rounded-[30px] border border-[#dfe5ed] bg-white p-6 shadow-[0_16px_36px_-8px_rgba(10,18,31,0.1)] md:min-h-[clamp(360px,23.95vw,680px)] md:rounded-[clamp(20px,1.27vw,36px)] md:p-[clamp(33px,2.04vw,58px)]">
            <div className="flex flex-wrap items-center gap-5 md:gap-[clamp(8px,0.78vw,22px)]">
              <h2 className="text-[28px] font-bold text-[#0e131e] md:text-[clamp(17px,1.06vw,30px)]">{st("查询结果")}</h2>
              {visibleOrders.length > 0 && (
                <p className="text-[15px] text-[#737d8f] md:text-[clamp(10px,0.53vw,15px)]">{st("已加载")} {visibleOrders.length} {st("条购买记录")}</p>
              )}
            </div>
            {searched && !loading && orders.length === 0 && (
              <div className="mt-10 rounded-[18px] border border-[#dbe5f5] p-8 text-[#6b7990]">
                {st("暂未找到订单，请确认联系方式是否填写正确。")}
              </div>
            )}
            <div className="mt-8 space-y-5 md:mt-[clamp(23px,1.41vw,40px)] md:space-y-[clamp(10px,0.63vw,18px)]">
              {visibleOrders.map(order => (
                <article key={order.order_no} className="rounded-[18px] border border-[#dbe5f5] bg-white p-5 md:rounded-[clamp(12px,0.78vw,22px)] md:px-[clamp(20px,1.25vw,36px)] md:py-[clamp(18px,1.13vw,32px)]">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-[16px] font-semibold text-[#111827] md:text-[clamp(10px,0.56vw,16px)]" title={order.order_no}>{st("订单号：")}{order.order_no}</p>
                    </div>
                    <span className={"inline-flex shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold leading-none md:px-[clamp(10px,0.7vw,20px)] md:py-[clamp(5px,0.35vw,10px)] md:text-[clamp(10px,0.53vw,15px)] " + getStatusMeta(order.status, st, order.product_type).className}>{getStatusMeta(order.status, st, order.product_type).label}</span>
                  </div>

                  <div className="order-query-divider my-5 h-px bg-[#dbe5f5] md:my-[clamp(12px,0.78vw,22px)]" />

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] font-medium text-[#5c697d] md:text-[clamp(10px,0.49vw,14px)]">
                    <span>{order.paid_at || order.created_at || "-"}</span>
                    <span className="order-query-product-name font-semibold text-[#404a5c]">{order.product_name}</span>
                    <span className="inline-flex rounded-full border border-[#d1def0] bg-[#f6f9fe] px-3 py-1 text-[12px] font-semibold leading-none text-[#4f5c70] md:px-[clamp(8px,0.49vw,14px)] md:py-[clamp(3px,0.21vw,6px)] md:text-[clamp(10px,0.49vw,14px)]">x{order.quantity}</span>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-4 md:mt-[clamp(12px,0.78vw,22px)]">
                    <p className="shrink-0 text-left text-[24px] font-semibold text-[#e82929] md:text-[clamp(15px,0.92vw,26px)]">{formatPrice(order.total_amount)}</p>
                    {canViewOrderDetail(order.status) && (
                      <Link to={`/orders/${order.order_no}/success`} className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#2663eb] px-5 text-[14px] font-semibold text-white shadow-[0_10px_22px_-14px_rgba(14,75,235,0.58)] md:h-[clamp(30px,1.75vw,40px)] md:rounded-[clamp(8px,0.52vw,11px)] md:px-[clamp(14px,0.84vw,24px)] md:text-[clamp(10px,0.53vw,15px)]">
                        {st("查看详情")}
                      </Link>
                    )}
                    {isPendingOrder(order.status) && (
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => cancelOrder(order)}
                          disabled={cancellingOrderNo === order.order_no}
                          className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-[10px] border border-[#d7e0ec] bg-white px-4 text-[14px] font-semibold text-[#5c697d] transition hover:border-[#b8c9e2] hover:bg-[#f8fbff] disabled:opacity-60 md:h-[clamp(30px,1.75vw,40px)] md:rounded-[clamp(8px,0.52vw,11px)] md:px-[clamp(12px,0.7vw,20px)] md:text-[clamp(10px,0.53vw,15px)]"
                        >
                          {cancellingOrderNo === order.order_no ? st("取消中...") : st("取消订单")}
                        </button>
                        <button type="button" onClick={() => openPayPanel(order)} className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#2663eb] px-5 text-[14px] font-semibold text-white shadow-[0_10px_22px_-14px_rgba(14,75,235,0.58)] md:h-[clamp(30px,1.75vw,40px)] md:rounded-[clamp(8px,0.52vw,11px)] md:px-[clamp(14px,0.84vw,24px)] md:text-[clamp(10px,0.53vw,15px)]">
                          {st("去支付")}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {searched && orders.length > 0 && (
              <div ref={desktopLoadMoreRef} className="mt-6 min-h-10 text-center text-[13px] font-semibold text-[#6b7990]">
                {loadingMore ? st("加载中...") : hasMore ? st("继续下拉加载更多") : st("已加载全部")}
              </div>
            )}
          </section>
        </div>
      </div>

      {activePayOrder && (
        <PayDialog
          order={activePayOrder}
          payInfo={payInfo}
          cashierUrl={cashierUrl}
          loading={payLoading}
          error={payError}
          status={payStatus}
          st={st}
          onClose={closePayDialog}
        />
      )}
    </>
  )
}
