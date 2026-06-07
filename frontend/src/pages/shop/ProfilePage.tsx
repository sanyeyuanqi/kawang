import { Link, useNavigate } from "react-router-dom"
import { useCallback, useEffect, useRef, useState } from "react"
import api from "@/api/client"
import { useAuth } from "@/hooks/useAuth"
import { useLanguage } from "@/context/LanguageContext"
import { formatPrice } from "@/lib/utils"

interface OrderRecord {
  id?: number
  order_no: string
  status: string
  total_amount: string
  product_name: string
  quantity: number
  contact_info: string
  codes?: { id: number; code_value: string }[]
  paid_at: string | null
  created_at: string | null
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

function getStatusMeta(status: string, st: (text: string) => string) {
  const normalized = status?.toLowerCase()
  if (normalized === "paid" || status === "已支付") return { label: st("已支付"), className: "bg-[#e8faf4] text-[#08a678] border-[#c9f0e3]" }
  if (normalized === "pending" || status === "待支付") return { label: st("待支付"), className: "bg-[#fff6df] text-[#f09e1f] border-[#ffe5ad]" }
  if (normalized === "delivered" || status === "已发卡") return { label: st("已发卡"), className: "bg-[#e8faf4] text-[#08a678] border-[#c9f0e3]" }
  if (normalized === "cancelled" || normalized === "canceled" || status === "已取消") return { label: st("已取消"), className: "bg-[#f2f5f9] text-[#6b7990] border-[#dfe5ed]" }
  if (normalized === "refunded" || status === "已退款") return { label: st("已退款"), className: "bg-[#f2f5f9] text-[#6b7990] border-[#dfe5ed]" }
  if (normalized === "after_sale" || normalized === "after-sales" || status === "售后中") return { label: st("售后中"), className: "bg-[#ebf2ff] text-[#0e4beb] border-[#cbdcff]" }
  return { label: status || st("未知状态"), className: "bg-[#f2f5f9] text-[#6b7990] border-[#dfe5ed]" }
}

function canViewOrderDetail(status: string) {
  const normalized = status?.toLowerCase()
  return normalized === "paid" || normalized === "delivered" || status === "已支付" || status === "已发卡"
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
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const ordersRef = useRef<OrderRecord[]>([])
  const ordersRequestingRef = useRef(false)
  const requestedCursorsRef = useRef<Set<string>>(new Set())
  const lastScrollYRef = useRef(0)
  const showProfile = activeSection === "profile"
  const showOrders = activeSection === "orders"

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

  if (!user) return null

  const roleLabel = user.role === "admin" ? t("profile.roleAdmin") : t("profile.roleBuyer")
  const displayName = user.username || user.email || "-"
  const loadedOrderCount = orders.length

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
                const statusMeta = getStatusMeta(order.status, st)
                const showDetail = canViewOrderDetail(order.status)
                return (
                  <article key={order.order_no} className="profile-order-card rounded-[18px] border border-[#dbe5f5] bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-all text-[15px] font-bold text-[#111827]">{st("订单号：")}{order.order_no}</p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <span className="text-[13px] font-medium text-[#5c697d]">{order.paid_at || order.created_at || "-"}</span>
                          <p className="text-[14px] font-semibold text-[#404a5c]">{order.product_name}</p>
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
                      {showDetail && (
                        <Link
                          to={`/orders/${order.order_no}/success`}
                          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[11px] bg-[#2663eb] px-5 text-[14px] font-semibold text-white shadow-[0_10px_22px_-14px_rgba(14,75,235,0.58)] transition hover:-translate-y-0.5 hover:bg-[#0e4beb]"
                        >
                          {st("查看详情")}
                        </Link>
                      )}
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
    </div>
  )
}
