import { Link, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import api from "@/api/client"
import { useAuth } from "@/hooks/useAuth"
import { useLanguage } from "@/context/LanguageContext"
import { formatPrice } from "@/lib/utils"

interface OrderRecord {
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

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] border border-[#dfe5ed] bg-[#f8fbff] px-4 py-3">
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

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t, st } = useLanguage()
  const [activeSection, setActiveSection] = useState<ProfileSection>("profile")
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState("")
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [copiedOrderNo, setCopiedOrderNo] = useState("")

  const handleLogout = async () => {
    await logout()
    navigate("/", { replace: true })
  }

  useEffect(() => {
    if (!user || activeSection !== "orders" || ordersLoaded || ordersLoading) return

    let cancelled = false
    const loadOrders = async () => {
      setOrdersLoading(true)
      setOrdersError("")
      try {
        const res = user.email
          ? await api.post("/orders/query", { contact_info: user.email, offset: 0, limit: 100 })
          : await api.get("/orders/mine")
        if (cancelled) return
        const payload = res.data.data
        setOrders(Array.isArray(payload) ? payload : (payload?.items || []))
        setOrdersLoaded(true)
      } catch (err: any) {
        if (cancelled) return
        setOrdersError(err.response?.data?.msg || st("查询失败，请稍后重试"))
      } finally {
        if (!cancelled) setOrdersLoading(false)
      }
    }

    loadOrders()
    return () => { cancelled = true }
  }, [activeSection, ordersLoaded, ordersLoading, st, user])

  if (!user) return null

  const roleLabel = user.role === "admin" ? t("profile.roleAdmin") : t("profile.roleBuyer")
  const displayName = user.username || user.email || "-"

  const copyCodes = async (order: OrderRecord) => {
    const text = (order.codes || []).map(code => code.code_value).join("\n")
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedOrderNo(order.order_no)
      setTimeout(() => setCopiedOrderNo(""), 1600)
    } catch {
      setCopiedOrderNo("")
    }
  }

  const showProfile = activeSection === "profile"
  const showOrders = activeSection === "orders"

  return (
    <div className="figma-web-container px-5 pb-24 pt-8 md:px-0 md:pt-[clamp(28px,1.9vw,48px)]">
      <section className="grid w-full gap-5 md:grid-cols-[minmax(240px,280px)_1fr]">
        <aside className="self-start rounded-[22px] border border-[#dfe5ed] bg-white p-4 shadow-[0_20px_46px_-38px_rgba(10,18,31,0.38)]">
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

        <div className="space-y-5">
          {showProfile && (
          <>
          <section className="flex flex-col gap-4 rounded-[18px] border border-[#d8e4f4] bg-[#e8f2ff] p-5 shadow-[0_20px_46px_-38px_rgba(10,18,31,0.38)] sm:flex-row sm:items-center">
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

          <section className="overflow-hidden rounded-[24px] border border-[#dfe5ed] bg-white shadow-[0_24px_60px_-42px_rgba(10,18,31,0.42)]">
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
          <section className="min-h-[520px] rounded-[24px] border border-[#dfe5ed] bg-white p-6 shadow-[0_24px_60px_-42px_rgba(10,18,31,0.42)] md:p-9">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-[20px] font-bold text-[#111827]">{t("profile.navOrders")}</h2>
              {user.email && <p className="text-[14px] text-[#6b7990]">{st("联系方式：")} {user.email}</p>}
              {!ordersLoading && ordersLoaded && <p className="text-[14px] text-[#6b7990]">{st("共查询到")} {orders.length} {st("条购买记录")}</p>}
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
                const codes = order.codes || []
                return (
                  <article key={order.order_no} className="rounded-[18px] border border-[#dbe5f5] bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-all text-[15px] font-bold text-[#111827]">{st("订单号：")}{order.order_no}</p>
                          <span className="inline-flex rounded-full border border-[#d1def0] bg-[#f6f9fe] px-3 py-1 text-[12px] font-semibold leading-none text-[#4f5c70]">{order.quantity} {st("件")}</span>
                        </div>
                        <p className="mt-2 text-[14px] font-semibold text-[#404a5c]">{order.product_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={"inline-flex rounded-full border px-4 py-2 text-[13px] font-semibold leading-none " + statusMeta.className}>{statusMeta.label}</span>
                        <span className="text-[22px] font-bold text-[#e82929]">{formatPrice(order.total_amount)}</span>
                      </div>
                    </div>

                    <div className="my-4 h-px bg-[#dbe5f5]" />

                    <div className="relative rounded-[14px] border border-[#d6e0f0] bg-[#f8fafe] px-4 py-3 pr-16">
                      {codes.length > 0 ? (
                        <div className="min-w-0 space-y-1 font-mono text-[14px] font-semibold leading-6 text-[#111827]">
                          {codes.map(code => <p key={code.id} className="break-all">{code.code_value}</p>)}
                        </div>
                      ) : (
                        <p className="text-[15px] text-[#6b7990]">{st("订单暂未发卡")}</p>
                      )}
                      {codes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => copyCodes(order)}
                          className="absolute right-4 top-3 grid h-10 w-10 place-items-center rounded-[11px] bg-[#2663eb] text-white transition hover:-translate-y-0.5 hover:bg-[#0e4beb]"
                          aria-label={st("复制卡密")}
                        >
                          ▣
                        </button>
                      )}
                      {copiedOrderNo === order.order_no && <span className="absolute right-4 top-full mt-1 whitespace-nowrap text-[12px] font-semibold text-[#0e4beb]">{st("已复制")}</span>}
                    </div>

                    <p className="mt-4 text-right text-[13px] font-medium text-[#5c697d]">{st("购买时间：")}{order.paid_at || order.created_at || "-"}</p>
                  </article>
                )
              })}
            </div>
          </section>
          )}

        </div>
      </section>
    </div>
  )
}
