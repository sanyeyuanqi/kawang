import { Link, useNavigate } from "react-router-dom"
import { useCallback, useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import api from "@/api/client"
import { useAuth } from "@/hooks/useAuth"
import { useLanguage } from "@/context/LanguageContext"
import { useOrderPaymentMonitor } from "@/hooks/useOrderPaymentMonitor"
import { formatPrice } from "@/lib/utils"

interface OrderRecord {
  id?: number
  order_no: string
  status: string
  total_amount: string
  product_name: string
  product_type?: string
  quantity: number
  contact_info: string
  codes?: { id: number; code_value: string }[]
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

type ProfileSection = "profile" | "orders"
const ORDER_PAGE_SIZE = 10

function orderKey(order: OrderRecord) {
  return String(order.id ?? order.order_no)
}

function mergeUniqueOrders(current: OrderRecord[], incoming: OrderRecord[]) {
  const seen = new Set(current.map(orderKey))
  const next = [...current]
  for (const order of incoming) {
    const key = orderKey(order)
    if (!seen.has(key)) {
      seen.add(key)
      next.push(order)
    }
  }
  return next
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="profile-info-row rounded-[14px] border border-[#dfe5ed] bg-[#f8fbff] px-4 py-3">
      <p className="text-[12px] font-semibold text-[#6b7990]">{label}</p>
      <p className="mt-2 break-all text-[15px] font-bold text-[#111827]">{value || "-"}</p>
    </div>
  )
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") return "-"
  if (typeof value === "boolean") return value ? "YES" : "NO"
  return value
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

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

        {payInfo?.html_form && <div id={`profile-alipay-form-${order.order_no}`} className="hidden" />}

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

function parseOrdersPayload(data: any) {
  if (Array.isArray(data)) {
    const items = (data as OrderRecord[]).slice(0, ORDER_PAGE_SIZE)
    const nextCursor = Number(items[items.length - 1]?.id || 0)
    return {
      items,
      total: data.length,
      prevCursor: Number(items[0]?.id || 0),
      nextCursor,
      nextCursorCreatedAt: items[items.length - 1]?.created_at || "",
      hasMore: data.length > items.length,
      limit: ORDER_PAGE_SIZE,
    }
  }
  const items = ((data?.records || data?.items || []) as OrderRecord[]).slice(0, ORDER_PAGE_SIZE)
  return {
    items,
    total: Number(data?.total || 0),
    prevCursor: Number(data?.prev_cursor ?? data?.before_cursor ?? items[0]?.id ?? 0),
    nextCursor: Number(data?.next_cursor ?? items[items.length - 1]?.id ?? 0),
    nextCursorCreatedAt: String(data?.next_cursor_created_at ?? data?.after_cursor_created_at ?? items[items.length - 1]?.created_at ?? ""),
    hasMore: Boolean(data?.has_more),
    limit: Number(data?.limit || ORDER_PAGE_SIZE),
  }
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t, st } = useLanguage()
  const [activeSection, setActiveSection] = useState<ProfileSection>("profile")
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [ordersCursor, setOrdersCursor] = useState(0)
  const [ordersCursorCreatedAt, setOrdersCursorCreatedAt] = useState("")
  const [hasMoreOrders, setHasMoreOrders] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false)
  const [ordersError, setOrdersError] = useState("")
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [cancellingOrderNo, setCancellingOrderNo] = useState<string | null>(null)
  const [deletingOrderNo, setDeletingOrderNo] = useState<string | null>(null)
  const [activePayOrderNo, setActivePayOrderNo] = useState<string | null>(null)
  const [payInfo, setPayInfo] = useState<PayInfo | null>(null)
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState("")
  const [payStatus, setPayStatus] = useState<"idle" | "ready" | "polling" | "paid" | "timeout">("idle")
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const ordersRef = useRef<OrderRecord[]>([])
  const ordersRequestingRef = useRef(false)
  const requestedCursorsRef = useRef<Set<string>>(new Set())
  const lastScrollYRef = useRef(0)
  const paidHandledRef = useRef(false)
  const showProfile = activeSection === "profile"
  const showOrders = activeSection === "orders"
  const cashierUrl = payInfo?.qr_content || payInfo?.qr_url

  const handleLogout = async () => {
    await logout()
    navigate("/", { replace: true })
  }

  useEffect(() => {
    setOrders([])
    ordersRef.current = []
    setOrdersCursor(0)
    setOrdersCursorCreatedAt("")
    setHasMoreOrders(false)
    setOrdersError("")
    setOrdersLoaded(false)
    setOrdersLoading(false)
    setOrdersLoadingMore(false)
    setCancellingOrderNo(null)
    setDeletingOrderNo(null)
    setActivePayOrderNo(null)
    setPayInfo(null)
    setPayLoading(false)
    setPayError("")
    setPayStatus("idle")
    ordersRequestingRef.current = false
    requestedCursorsRef.current.clear()
    lastScrollYRef.current = window.scrollY
  }, [user?.id])

  const loadOrdersPage = useCallback(async (afterId: number, afterCreatedAt = "", append = false) => {
    if (ordersRequestingRef.current) return
    const cursorKey = `${afterId}:${afterCreatedAt}`
    if (append && requestedCursorsRef.current.has(cursorKey)) return
    ordersRequestingRef.current = true
    requestedCursorsRef.current.add(cursorKey)
    if (append) setOrdersLoadingMore(true)
    else setOrdersLoading(true)
    setOrdersError("")
    try {
      const res = await api.get("/orders/mine", {
        params: { contact_info: user?.email || undefined, after_id: afterId, after_created_at: afterCreatedAt || undefined, limit: ORDER_PAGE_SIZE },
      })
      const payload = parseOrdersPayload(res.data.data)
      const nextOrders = append ? mergeUniqueOrders(ordersRef.current, payload.items) : payload.items
      ordersRef.current = nextOrders
      setOrders(nextOrders)
      setOrdersCursor(payload.nextCursor)
      setOrdersCursorCreatedAt(payload.nextCursorCreatedAt)
      const cursorAdvanced = payload.nextCursor > 0 && (!append || payload.nextCursor !== afterId)
      setHasMoreOrders(Boolean(payload.hasMore && cursorAdvanced))
      setOrdersLoaded(true)
    } catch (err: any) {
      setOrdersError(err.response?.data?.msg || st("查询失败，请稍后重试"))
      setOrdersLoaded(true)
    } finally {
      if (append) setOrdersLoadingMore(false)
      else setOrdersLoading(false)
      ordersRequestingRef.current = false
    }
  }, [st, user?.email])

  useEffect(() => {
    if (!user || activeSection !== "orders" || ordersLoaded) return

    const loadOrders = async () => {
      await loadOrdersPage(0)
    }

    loadOrders()
  }, [activeSection, loadOrdersPage, ordersLoaded, user])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !showOrders || !hasMoreOrders || ordersLoading || ordersLoadingMore) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMoreOrders && !ordersLoading && !ordersLoadingMore) {
        if (window.scrollY <= lastScrollYRef.current) return
        lastScrollYRef.current = window.scrollY
        loadOrdersPage(ordersCursor, ordersCursorCreatedAt, true)
      }
    }, { rootMargin: "260px 0px" })

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMoreOrders, loadOrdersPage, ordersCursor, ordersCursorCreatedAt, ordersLoading, ordersLoadingMore, showOrders])

  const closePayDialog = () => {
    setActivePayOrderNo(null)
    setPayInfo(null)
    setPayError("")
    setPayStatus("idle")
    setPayLoading(false)
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

  const cancelOrder = async (order: OrderRecord) => {
    if (cancellingOrderNo) return
    const confirmed = window.confirm(st("确定要取消这个订单吗？"))
    if (!confirmed) return

    setOrdersError("")
    setCancellingOrderNo(order.order_no)
    try {
      const response = await api.post<{ code: number; msg: string; data: OrderRecord }>(`/orders/${order.order_no}/cancel`, {
        contact_info: order.contact_info,
      })
      const cancelledOrder = response.data.data
      const nextOrders = ordersRef.current.map(item => item.order_no === order.order_no ? { ...item, ...cancelledOrder } : item)
      ordersRef.current = nextOrders
      setOrders(nextOrders)
      sessionStorage.removeItem(`pay_info_${order.order_no}`)
    } catch (err: any) {
      setOrdersError(getErrorMessage(err, st("取消订单失败，请稍后重试")))
    } finally {
      setCancellingOrderNo(null)
    }
  }

  const deleteOrder = async (order: OrderRecord) => {
    if (deletingOrderNo) return
    const confirmed = window.confirm(st("确定要删除这个订单吗？"))
    if (!confirmed) return

    setOrdersError("")
    setDeletingOrderNo(order.order_no)
    try {
      await api.delete(`/orders/${order.order_no}`)
      const nextOrders = ordersRef.current.filter(item => item.order_no !== order.order_no)
      ordersRef.current = nextOrders
      setOrders(nextOrders)
      sessionStorage.removeItem(`pay_info_${order.order_no}`)
      if (activePayOrderNo === order.order_no) closePayDialog()
    } catch (err: any) {
      setOrdersError(getErrorMessage(err, st("删除订单失败，请稍后重试")))
    } finally {
      setDeletingOrderNo(null)
    }
  }

  useEffect(() => {
    if (payStatus === "ready" && payInfo?.pay_type === 0 && payInfo.html_form) {
      const container = document.getElementById(`profile-alipay-form-${activePayOrderNo}`)
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
      const markPaid = (order: OrderRecord) => order.order_no === activePayOrderNo ? { ...order, status: "paid", paid_at: order.paid_at || order.created_at } : order
      ordersRef.current = ordersRef.current.map(markPaid)
      setOrders(prev => prev.map(markPaid))
      setTimeout(() => navigate(`/orders/${activePayOrderNo}/success`), 900)
    },
    onCancelled: () => {
      setPayStatus("timeout")
      setPayError(st("订单已取消，如已付款请联系客服处理"))
    },
    onTimeout: () => setPayStatus("timeout"),
    onError: () => setPayStatus((current) => current === "ready" ? "polling" : current),
  })

  if (!user) return null

  const roleLabel = user.role === "admin" ? t("profile.roleAdmin") : t("profile.roleBuyer")
  const displayName = user.username || user.email || "-"
  const loadedOrderCount = orders.length
  const activePayOrder = activePayOrderNo ? orders.find(order => order.order_no === activePayOrderNo) || null : null

  return (
    <div className="profile-shell figma-web-container px-5 pb-24 pt-8 md:px-0 md:pt-[clamp(28px,1.9vw,48px)]">
      <section className="grid w-full gap-5 md:grid-cols-[minmax(240px,280px)_1fr]">
        <div className="self-start">
        <aside className="profile-sidebar rounded-[22px] border border-[#dfe5ed] bg-white p-4 shadow-[0_20px_46px_-38px_rgba(10,18,31,0.38)] md:fixed md:top-[calc(clamp(54px,3.38vw,96px)+clamp(28px,1.9vw,48px))] md:max-h-[calc(100vh-clamp(54px,3.38vw,96px)-clamp(28px,1.9vw,48px)-24px)] md:w-[280px] md:overflow-y-auto">
          <nav className="grid gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("profile")}
              className={"flex h-12 items-center justify-between rounded-[14px] px-4 text-left text-[14px] font-bold transition " + (showProfile ? "bg-[#0e4beb] text-white shadow-[0_14px_28px_-20px_rgba(14,75,235,0.72)]" : "text-[#404a5c] hover:bg-[#f4f7fb] hover:text-[#0e4beb]")}
            >
              <span>{t("profile.navProfile")}</span>
              <span className={"h-2 w-2 rounded-full " + (showProfile ? "bg-white" : "bg-[#d7e3f2]")} />
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("orders")}
              className={"flex h-12 items-center justify-between rounded-[14px] px-4 text-left text-[14px] font-semibold transition " + (showOrders ? "bg-[#0e4beb] text-white shadow-[0_14px_28px_-20px_rgba(14,75,235,0.72)]" : "text-[#404a5c] hover:bg-[#f4f7fb] hover:text-[#0e4beb]")}
            >
              <span>{t("profile.navOrders")}</span>
              <span className={showOrders ? "text-white" : "text-[#9aa8bb]"}>›</span>
            </button>
            {user.role === "admin" && (
              <Link
                to="/admin"
                className="flex h-12 items-center justify-between rounded-[14px] px-4 text-[14px] font-semibold text-[#404a5c] transition hover:bg-[#f4f7fb] hover:text-[#0e4beb]"
              >
                <span>{t("profile.goAdmin")}</span>
                <span className="text-[#9aa8bb]">›</span>
              </Link>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex h-12 items-center justify-between rounded-[14px] px-4 text-left text-[14px] font-bold text-[#ef3333] transition hover:bg-[#fff1f1]"
            >
              <span>{t("nav.logout")}</span>
              <span>↗</span>
            </button>
          </nav>
        </aside>
        </div>

        <div className="space-y-5">
          {showProfile && (
          <>
          <section className="profile-hero-card flex flex-col gap-4 rounded-[18px] border border-[#d8e4f4] bg-[#e8f2ff] p-5 shadow-[0_20px_46px_-38px_rgba(10,18,31,0.38)] sm:flex-row sm:items-center">
            <img
              src="/images/avatar_male_15.png"
              alt={displayName}
              className="h-16 w-16 shrink-0 rounded-full border border-[#d8e4f4] bg-white object-cover shadow-[0_18px_36px_-26px_rgba(14,75,235,0.5)]"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-bold leading-6 text-[#111827]">{displayName}</p>
              <p className="mt-1 text-[13px] font-semibold text-[#6b7990]">{formatValue(user.email)}</p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#0e4beb] shadow-[0_10px_22px_-18px_rgba(14,75,235,0.45)]">
              {roleLabel}
            </span>
          </section>

          <section className="profile-panel overflow-hidden rounded-[24px] border border-[#dfe5ed] bg-white shadow-[0_24px_60px_-42px_rgba(10,18,31,0.42)]">
            <div id="profile-info" className="p-6 md:p-9">
              <h2 className="text-[20px] font-bold text-[#111827]">{t("profile.accountInfo")}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <InfoRow label={t("profile.username")} value={user.username} />
                <InfoRow label={t("profile.email")} value={formatValue(user.email)} />
                <InfoRow label={t("profile.phone")} value={formatValue(user.phone)} />
                <InfoRow label={t("profile.role")} value={roleLabel} />
                <InfoRow label={t("profile.userId")} value={user.id} />
                <InfoRow label={t("profile.status")} value={user.is_active ? t("profile.statusActive") : t("profile.statusDisabled")} />
                <InfoRow label={t("profile.createdAt")} value={formatDate(user.created_at)} />
                <InfoRow label={t("profile.updatedAt")} value={formatDate(user.updated_at)} />
              </div>
            </div>
          </section>
          </>
          )}

          {showOrders && (
          <section className="profile-panel min-h-[520px] rounded-[24px] border border-[#dfe5ed] bg-white p-6 shadow-[0_24px_60px_-42px_rgba(10,18,31,0.42)] md:p-9">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-[20px] font-bold text-[#111827]">{t("profile.navOrders")}</h2>
              {user.email && <p className="text-[14px] text-[#6b7990]">{st("联系方式：")} {user.email}</p>}
              {!ordersLoading && ordersLoaded && <p className="text-[14px] text-[#6b7990]">{st("已加载")} {loadedOrderCount} {st("条购买记录")}</p>}
            </div>

            {ordersLoading && (
              <div className="mt-8 rounded-[18px] border border-dashed border-[#d7e3f2] bg-[#f8fbff] p-10 text-center text-[14px] font-semibold text-[#6b7990]">
                {st("查询中...")}
              </div>
            )}

            {ordersError && (
              <div className="mt-8 rounded-[18px] border border-[#ffd4d4] bg-[#fff6f6] p-6 text-[14px] font-semibold text-[#ef3333]">
                {ordersError}
              </div>
            )}

            {!ordersLoading && !ordersError && ordersLoaded && orders.length === 0 && (
              <div className="mt-8 rounded-[18px] border border-dashed border-[#d7e3f2] bg-[#f8fbff] p-10 text-center">
                <h3 className="text-[20px] font-bold text-[#111827]">{st("暂无订单")}</h3>
                <p className="mt-3 text-[14px] leading-6 text-[#6b7990]">{st("当前邮箱暂未查询到购买记录。")}</p>
              </div>
            )}

            <div className="mt-6 space-y-4">
              {orders.map(order => {
                const statusMeta = getStatusMeta(order.status, st, order.product_type)
                const showDetail = canViewOrderDetail(order.status)
                const showCancel = isPendingOrder(order.status)
                const showPay = isPendingOrder(order.status)
                return (
                  <article key={order.order_no} className="profile-order-card rounded-[18px] border border-[#dbe5f5] bg-white p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-[15px] font-bold text-[#111827]">{st("订单号：")}</span>
                          <p className="profile-order-no min-w-0 truncate text-[15px] font-bold text-[#111827]" title={order.order_no}>{order.order_no}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="profile-order-time text-[13px] font-medium text-[#5c697d]">{order.paid_at || order.created_at || "-"}</span>
                          <p className="profile-order-product text-[14px] font-semibold text-[#404a5c]">{order.product_name}</p>
                          <span className="profile-order-quantity inline-flex rounded-full border border-[#d1def0] bg-[#f6f9fe] px-3 py-1 text-[12px] font-semibold leading-none text-[#4f5c70]">x{order.quantity}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={"inline-flex rounded-full border px-4 py-2 text-[13px] font-semibold leading-none " + statusMeta.className}>{statusMeta.label}</span>
                      </div>
                    </div>

                    <div className="profile-order-divider my-4 h-px bg-[#dbe5f5]" />

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-[13px] font-medium leading-6 text-[#5c697d]">
                        {!showDetail && <p className="text-[15px]">{st("订单暂未发卡")}</p>}
                        <span className="text-[22px] font-bold leading-none text-[#e82929]">{formatPrice(order.total_amount)}</span>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {showPay && (
                          <button
                            type="button"
                            onClick={() => openPayPanel(order)}
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-[11px] bg-[#2663eb] px-5 text-[14px] font-semibold text-white shadow-[0_10px_22px_-14px_rgba(14,75,235,0.58)] transition hover:-translate-y-0.5 hover:bg-[#0e4beb]"
                          >
                            {st("去支付")}
                          </button>
                        )}
                        {showCancel && (
                          <button
                            type="button"
                            onClick={() => cancelOrder(order)}
                            disabled={cancellingOrderNo === order.order_no}
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-[11px] bg-transparent px-5 text-[14px] font-semibold text-[#c8d4e6] transition hover:bg-white/5 hover:text-white disabled:opacity-60"
                          >
                            {cancellingOrderNo === order.order_no ? st("取消中...") : st("取消订单")}
                          </button>
                        )}
                        {showDetail && (
                          <Link
                            to={`/orders/${order.order_no}/success`}
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-[11px] bg-[#2663eb] px-5 text-[14px] font-semibold text-white shadow-[0_10px_22px_-14px_rgba(14,75,235,0.58)] transition hover:-translate-y-0.5 hover:bg-[#0e4beb]"
                          >
                            {st("查看详情")}
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteOrder(order)}
                          disabled={deletingOrderNo === order.order_no}
                          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[11px] bg-transparent px-5 text-[14px] font-semibold text-[#ef3333] transition hover:bg-[#fff1f1] disabled:opacity-60"
                        >
                          {deletingOrderNo === order.order_no ? st("删除中...") : st("删除订单")}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            {ordersLoaded && orders.length > 0 && (
              <div ref={loadMoreRef} className="mt-6 min-h-10 text-center text-[13px] font-semibold text-[#6b7990]">
                {ordersLoadingMore ? st("加载中...") : hasMoreOrders ? st("继续下拉加载更多") : st("已加载全部")}
              </div>
            )}
          </section>
          )}

        </div>
      </section>
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
    </div>
  )
}
