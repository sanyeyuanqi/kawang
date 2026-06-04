import { useCallback, useEffect, useState } from "react"
import api from "@/api/client"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import StatCard from "@/components/ui/StatCard"
import { formatPrice } from "@/lib/utils"

interface DashboardData {
  stats: {
    product_count: number
    available_stock: number
    pending_orders: number
    paid_orders: number
    total_revenue: string
    today_revenue: string
  }
  recent_orders: Array<{
    id: number
    order_no: string
    product_name: string
    contact_info: string
    status: string
    total_amount: string
    created_at: string | null
  }>
}

const statusLabel: Record<string, string> = {
  pending: "待支付",
  paid: "已发卡",
  cancelled: "已取消",
  canceled: "已取消",
  refunded: "已退款",
}

const statusClass: Record<string, string> = {
  pending: "bg-warning-50 text-warning-600",
  paid: "bg-success-50 text-success-600",
  cancelled: "bg-gray-100 text-gray-500",
  canceled: "bg-gray-100 text-gray-500",
  refunded: "bg-danger-50 text-danger-500",
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.get("/admin/dashboard")
      setData(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.msg || "系统概览加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = data?.stats
  const cards = stats ? [
    { label: "今日收入", value: formatPrice(stats.today_revenue), tone: "red" as const },
    { label: "今日订单", value: stats.paid_orders, tone: "blue" as const },
    { label: "可售卡密", value: stats.available_stock, tone: "green" as const },
    { label: "待支付订单", value: stats.pending_orders, tone: "orange" as const },
  ] : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-26 font-bold text-[#111827]">系统概览</h1>
        <p className="mt-2 text-14 text-[#8e99aa]">查看销售额、订单、库存与最近购买记录</p>
      </div>

      {error && (
        <div className="rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading && !error && (
        <div className="rounded-[18px] bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.06)] md:p-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[138px] animate-pulse rounded-[18px] border border-[#edf1f6] bg-[#f4f7fb]" />
            ))}
          </div>
          <div className="mt-8 h-[260px] animate-pulse rounded-[18px] border border-[#edf1f6] bg-[#f4f7fb]" />
        </div>
      )}

      {!loading && !error && (
      <div className="rounded-[18px] bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.06)] md:p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        <section className="mt-8 rounded-[18px] border border-[#edf1f6] bg-[#fbfdff] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-18 font-bold text-[#111827]">最近订单</h2>
            <span className="text-13 text-[#8e99aa]">最近 3 条</span>
          </div>

          {data?.recent_orders?.length ? (
            <div className="mt-4 divide-y divide-[#edf1f6]">
              {data.recent_orders.map((order) => (
                <div key={order.id} className="grid gap-3 py-4 text-14 md:grid-cols-[1.2fr_1fr_1fr_0.7fr_0.8fr] md:items-center">
                  <span className="font-semibold text-[#111827]">{order.order_no}</span>
                  <span className="text-[#404a5c]">{order.product_name}</span>
                  <span className="text-[#727c8e]">{order.contact_info}</span>
                  <span className="font-semibold text-[#e82828]">{formatPrice(order.total_amount)}</span>
                  <span className={`justify-self-start rounded-full px-3 py-1 text-12 font-semibold ${statusClass[order.status] || "bg-gray-100 text-gray-500"}`}>
                    {statusLabel[order.status] || order.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无订单记录" description="有新订单后会自动显示在这里。" className="mt-4 rounded-[14px] bg-white" />
          )}
        </section>
      </div>
      )}
    </div>
  )
}
