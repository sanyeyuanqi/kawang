import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import api from "@/api/client"
import { formatPrice } from "@/lib/utils"
import MobilePhoneFrame from "@/components/shop/MobilePhoneFrame"
import { useLanguage } from "@/context/LanguageContext"

interface OrderRecord {
  order_no: string
  status: string
  total_amount: string
  product_name: string
  quantity: number
  contact_info: string
  codes: { id: number; code_value: string }[]
  paid_at: string | null
  created_at: string | null
}

const PAGE_SIZE = 10

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

export default function OrderQueryPage() {
  const { st } = useLanguage()
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
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const hasMore = searched && hasMoreOrders

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

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore || loading || loadingMore) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
        loadOrdersPage(offset, true)
      }
    }, { rootMargin: "260px 0px" })

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, offset])

  const visibleOrders = searched ? orders : []
  const primaryOrder = visibleOrders[0]

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
        ) : primaryOrder ? (
          <section className="mt-[70px] rounded-[20px] border border-[#dfe5ed] bg-white p-7 shadow-[0_12px_28px_-12px_rgba(10,18,31,0.12)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-bold text-[#0e131e]">{primaryOrder.product_name}</h2>
              <span className={"rounded-full border px-4 py-2 text-[13px] font-medium leading-none " + getStatusMeta(primaryOrder.status, st).className}>{getStatusMeta(primaryOrder.status, st).label}</span>
            </div>
            <p className="mt-3 text-[15px] text-[#6b7990]">{st("订单号")} {primaryOrder.order_no} · {formatPrice(primaryOrder.total_amount)}</p>
            {canViewOrderDetail(primaryOrder.status) && (
              <div className="mt-6 rounded-[14px] bg-[#ebf2ff] px-4 py-4 text-[15px] leading-[22px] text-[#0e4beb]">
                <div className="space-y-4">
                  <p className="font-medium">{st("订单已支付，点击查看详情获取卡密。")}</p>
                  <Link to={`/orders/${primaryOrder.order_no}/success`} className="flex h-[46px] w-full items-center justify-center rounded-[13px] bg-[#0e4beb] text-[17px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(14,75,235,0.65)]">
                    {st("查看详情")}
                  </Link>
                </div>
              </div>
            )}
          </section>
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
                      <p className="break-all text-[16px] font-semibold text-[#111827] md:text-[clamp(10px,0.56vw,16px)]">{st("订单号：")}{order.order_no}</p>
                      <span className="inline-flex rounded-full border border-[#d1def0] bg-[#f6f9fe] px-3 py-1 text-[13px] font-semibold leading-none text-[#4f5c70] md:px-[clamp(8px,0.49vw,14px)] md:py-[clamp(3px,0.21vw,6px)] md:text-[clamp(10px,0.49vw,14px)]">{order.quantity} {st("件")}</span>
                    </div>
                    <span className={"inline-flex shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold leading-none md:px-[clamp(10px,0.7vw,20px)] md:py-[clamp(5px,0.35vw,10px)] md:text-[clamp(10px,0.53vw,15px)] " + getStatusMeta(order.status, st).className}>{getStatusMeta(order.status, st).label}</span>
                  </div>

                  <div className="my-5 h-px bg-[#dbe5f5] md:my-[clamp(12px,0.78vw,22px)]" />

                  {canViewOrderDetail(order.status) && (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#d6e0f0] bg-[#f8fafe] px-4 py-4 md:min-h-[clamp(46px,2.89vw,82px)] md:rounded-[clamp(8px,0.49vw,14px)] md:px-[clamp(12px,0.7vw,20px)] md:py-[clamp(10px,0.7vw,20px)]">
                      <p className="min-w-0 text-[15px] font-medium leading-6 text-[#5c697d] md:text-[clamp(10px,0.56vw,16px)]">
                        {st("订单已支付，点击查看详情获取卡密。")}
                      </p>
                      <Link to={`/orders/${order.order_no}/success`} className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#2663eb] px-5 text-[14px] font-semibold text-white shadow-[0_10px_22px_-14px_rgba(14,75,235,0.58)] md:h-[clamp(30px,1.75vw,40px)] md:rounded-[clamp(8px,0.52vw,11px)] md:px-[clamp(14px,0.84vw,24px)] md:text-[clamp(10px,0.53vw,15px)]">
                        {st("查看详情")}
                      </Link>
                    </div>
                  )}

                  <div className="mt-5 flex items-end justify-between gap-4 md:mt-[clamp(12px,0.78vw,22px)]">
                    <p className="text-[14px] font-medium text-[#5c697d] md:text-[clamp(10px,0.49vw,14px)]">{st("购买时间：")}{order.paid_at || order.created_at || "-"}</p>
                    <p className="shrink-0 text-[24px] font-semibold text-[#e82929] md:text-[clamp(15px,0.92vw,26px)]">{formatPrice(order.total_amount)}</p>
                  </div>
                </article>
              ))}
            </div>
            {searched && orders.length > 0 && (
              <div ref={loadMoreRef} className="mt-6 min-h-10 text-center text-[13px] font-semibold text-[#6b7990]">
                {loadingMore ? st("加载中...") : hasMore ? st("继续下拉加载更多") : st("已加载全部")}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
