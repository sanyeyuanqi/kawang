import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import api from "@/api/client"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Drawer } from "@/components/ui/Drawer"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import type { TableColumn } from "@/components/ui/Table"
import { useToast } from "@/components/ui/Toast"
import { copyToClipboard, formatPrice } from "@/lib/utils"

const PAGE_SIZE = 10

interface OrderCode {
  id: number
  code_value: string
  status: string
}

interface OrderItem {
  id: number
  order_no: string
  product_id: number
  product_name: string
  product_price: string
  product_type?: "auto_delivery" | "preorder" | string
  quantity: number
  total_amount: string
  contact_info: string
  status: "pending" | "paid" | "delivered" | "cancelled" | "refunded" | string
  pay_channel?: string | null
  haozpay_seq_id?: string | null
  refund_amount?: string | null
  refund_seq_id?: string | null
  paid_at?: string | null
  delivered_at?: string | null
  delivery_info?: string | null
  cancelled_at?: string | null
  created_at: string
  refund_available?: boolean
  refund_unavailable_reason?: string | null
  payment_query_status?: string | null
  refund_checked_at?: string | null
  codes?: OrderCode[]
}

type StatusKey = "" | "pending" | "paid" | "delivered" | "refunded" | "cancelled"

interface OrderStats {
  all: number
  pending: number
  paid: number
  delivered: number
  refunded: number
  cancelled: number
}

const statusOptions: { key: StatusKey; label: string }[] = [
  { key: "", label: "全部" },
  { key: "paid", label: "待发货/已发卡" },
  { key: "delivered", label: "已发货" },
  { key: "pending", label: "待支付" },
  { key: "refunded", label: "已退款" },
  { key: "cancelled", label: "已取消" },
]

const statusLabel: Record<string, string> = {
  pending: "待支付",
  paid: "已发卡",
  delivered: "已发货",
  cancelled: "已取消",
  canceled: "已取消",
  refunded: "已退款",
}

const statusClass: Record<string, string> = {
  pending: "bg-warning-50 text-warning-600",
  paid: "bg-success-50 text-success-600",
  delivered: "bg-success-50 text-success-600",
  cancelled: "bg-gray-100 text-gray-500",
  canceled: "bg-gray-100 text-gray-500",
  refunded: "bg-danger-50 text-danger-500",
}

const emptyStats: OrderStats = { all: 0, pending: 0, paid: 0, delivered: 0, refunded: 0, cancelled: 0 }

export default function AdminOrdersPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState<OrderItem[]>([])
  const [selected, setSelected] = useState<OrderItem | null>(null)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<StatusKey>("")
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<OrderStats>(emptyStats)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [resendTarget, setResendTarget] = useState<OrderItem | null>(null)
  const [resending, setResending] = useState(false)
  const [refundTarget, setRefundTarget] = useState<OrderItem | null>(null)
  const [forceRefundTarget, setForceRefundTarget] = useState<OrderItem | null>(null)
  const [refunding, setRefunding] = useState(false)
  const [deliveryTarget, setDeliveryTarget] = useState<OrderItem | null>(null)
  const [deliveryInfo, setDeliveryInfo] = useState("")
  const [delivering, setDelivering] = useState(false)

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get("/admin/orders", {
        params: { q: q.trim() || undefined, status: status || undefined, offset, limit: PAGE_SIZE },
      })
      setItems(res.data.data.items)
      setTotal(res.data.data.total)
      setStats(res.data.data.stats || emptyStats)
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "订单列表加载失败" })
    } finally {
      setLoading(false)
    }
  }, [addToast, offset, q, status])

  useEffect(() => {
    load()
  }, [load])

  const showDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const res = await api.get(`/admin/orders/${id}`)
      setSelected(res.data.data)
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "订单详情加载失败" })
    } finally {
      setDetailLoading(false)
    }
  }

  const resetSearch = () => {
    setOffset(0)
    load()
  }

  const changeStatus = (nextStatus: StatusKey) => {
    setStatus(nextStatus)
    setOffset(0)
  }

  const resend = async () => {
    if (!resendTarget) return
    setResending(true)
    try {
      const res = await api.post(`/admin/orders/${resendTarget.id}/resend`)
      setSelected(res.data.data)
      setResendTarget(null)
      addToast({ type: "success", message: "卡密已补发" })
      await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "补发失败" })
    } finally {
      setResending(false)
    }
  }

  const isFulfilledOrder = (item: OrderItem | null) => Boolean(item && (item.status === "delivered" || (item.status === "paid" && item.product_type !== "preorder")))
  const canRefundOrder = (item: OrderItem | null) => Boolean(item?.refund_available)

  const getRefundMessage = (item: OrderItem | null) => {
    if (!item) return ""
    if (item.product_type === "preorder") return `确定对订单 ${item.order_no} 发起退款吗？`
    return `确定对订单 ${item.order_no} 发起退款并回收卡密吗？`
  }

  const requestRefund = () => {
    if (!refundTarget) return
    if (isFulfilledOrder(refundTarget)) {
      setForceRefundTarget(refundTarget)
      setRefundTarget(null)
      return
    }
    refund(refundTarget, false)
  }

  const refund = async (target: OrderItem | null = refundTarget, force = false) => {
    if (!target) return
    setRefunding(true)
    try {
      const res = await api.post(`/admin/orders/${target.id}/refund`, { force })
      setSelected(res.data.data)
      setRefundTarget(null)
      setForceRefundTarget(null)
      addToast({ type: "success", message: target.product_type === "preorder" ? "退款已提交" : "退款已提交，卡密已回收" })
      await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "退款失败" })
    } finally {
      setRefunding(false)
    }
  }

  const openDeliveryModal = (order: OrderItem) => {
    setDeliveryTarget(order)
    setDeliveryInfo(order.delivery_info || "")
  }

  const deliver = async () => {
    if (!deliveryTarget) return
    const info = deliveryInfo.trim()
    if (!info) {
      addToast({ type: "warning", message: "请填写发货信息" })
      return
    }
    setDelivering(true)
    try {
      const res = await api.post(`/admin/orders/${deliveryTarget.id}/deliver`, { delivery_info: info })
      setSelected(res.data.data)
      setDeliveryTarget(null)
      setDeliveryInfo("")
      addToast({ type: "success", message: "订单已确认发货" })
      await load()
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "确认发货失败" })
    } finally {
      setDelivering(false)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await api.get("/admin/orders/export", {
        params: { q: q.trim() || undefined, status: status || undefined },
        responseType: "blob",
      })
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `orders-${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      addToast({ type: "success", message: "订单 CSV 已导出" })
    } catch (err: any) {
      addToast({ type: "error", message: err.response?.data?.msg || "导出失败" })
    } finally {
      setExporting(false)
    }
  }

  const copyCodes = async () => {
    if (!selected?.codes?.length) return
    const ok = await copyToClipboard(selected.codes.map((code) => code.code_value).join("\n"))
    addToast({ type: ok ? "success" : "error", message: ok ? "卡密已复制" : "复制失败" })
  }

  const statItems = useMemo(() => [
    { label: "全部订单", value: stats.all, key: "" as StatusKey },
    { label: "待发货/已发卡", value: stats.paid, key: "paid" as StatusKey },
    { label: "已发货", value: stats.delivered, key: "delivered" as StatusKey },
    { label: "待支付", value: stats.pending, key: "pending" as StatusKey },
    { label: "已退款", value: stats.refunded, key: "refunded" as StatusKey },
  ], [stats])

  const getStatusLabel = (item: OrderItem) => {
    if (item.status === "paid" && item.product_type === "preorder") return "待发货"
    return statusLabel[item.status] || item.status
  }

  const canResendCodes = (item: OrderItem | null) => Boolean(item && item.status === "paid" && item.product_type !== "preorder")
  const canDeliverOrder = (item: OrderItem | null) => Boolean(item && item.status === "paid" && item.product_type === "preorder")

  const columns: TableColumn<OrderItem>[] = [
    {
      key: "order_no",
      title: "订单号",
      width: 210,
      render: (item) => <span className="font-mono font-semibold text-[#111827]">{item.order_no}</span>,
    },
    {
      key: "product_name",
      title: "商品",
      width: 220,
      render: (item) => <span>{item.product_name} <span className="text-[#8e99aa]">x{item.quantity}</span></span>,
    },
    {
      key: "contact_info",
      title: "联系方式",
      width: 180,
      render: (item) => <span className="text-[#5d6675]">{item.contact_info}</span>,
    },
    {
      key: "total_amount",
      title: "金额",
      width: 120,
      render: (item) => <span className="font-semibold text-danger-500">{formatPrice(item.total_amount)}</span>,
    },
    {
      key: "status",
      title: "状态",
      width: 120,
      render: (item) => <span className={`inline-flex h-8 items-center rounded-full px-3 text-13 font-medium ${statusClass[item.status] || "bg-gray-100 text-gray-500"}`}>{getStatusLabel(item)}</span>,
    },
    {
      key: "created_at",
      title: "时间",
      width: 180,
      render: (item) => <span className="text-[#6b7990]">{item.created_at}</span>,
    },
    {
      key: "actions",
      title: "操作",
      width: 170,
      render: (item) => (
        <div className="flex items-center gap-2">
          {canDeliverOrder(item) && (
            <button
              type="button"
              onClick={() => openDeliveryModal(item)}
              className="h-9 rounded-[10px] bg-success-500 px-4 text-13 font-semibold text-white hover:bg-success-600"
            >
              发货
            </button>
          )}
          <button
            type="button"
            onClick={() => showDetail(item.id)}
            className="h-9 rounded-[10px] bg-primary-500 px-4 text-13 font-semibold text-white hover:bg-primary-600"
          >
            查看详情
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="admin-orders-page space-y-5">
      <div className="grid gap-4 md:grid-cols-5">
        {statItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => changeStatus(item.key)}
            className={`rounded-[18px] bg-white px-5 py-5 text-left shadow-[0_22px_60px_rgba(15,23,42,0.06)] transition-colors hover:bg-[#f8fbff] ${status === item.key ? "ring-2 ring-primary-500/40" : ""}`}
          >
            <p className="text-13 font-medium text-[#8e99aa]">{item.label}</p>
            <strong className="mt-2 block text-26 text-[#111827]">{item.value}</strong>
          </button>
        ))}
      </div>

      <div className="rounded-[18px] bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.06)] md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-24 font-bold text-[#111827]">订单管理</h1>
            <p className="mt-1 text-14 text-[#8e99aa]">查询订单、查看卡密、处理补发和退款</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") resetSearch()
              }}
              placeholder="订单号 / 联系方式 / 商品"
              className="h-11 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-3 text-14 outline-none focus:border-primary-500 md:w-72"
            />
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((item) => (
                <button
                  key={item.key || "all"}
                  type="button"
                  onClick={() => changeStatus(item.key)}
                  className={`h-11 rounded-[12px] px-4 text-14 font-semibold ${status === item.key ? "bg-primary-500 text-white" : "border border-[#dfe6ef] bg-white text-[#5d6675] hover:bg-[#fbfdff]"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button onClick={resetSearch} className="h-11 rounded-[12px] bg-primary-500 px-5 text-14 font-semibold text-white hover:bg-primary-600">查询</button>
            <button onClick={exportCsv} disabled={exporting} className="h-11 rounded-[12px] border border-[#dfe6ef] px-5 text-14 font-semibold text-[#5d6675] hover:bg-[#fbfdff] disabled:opacity-50">
              {exporting ? "导出中" : "导出 CSV"}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <div className="min-w-[1560px]">
              <Table columns={columns} dataSource={items} rowKey="id" loading={loading} emptyText={detailLoading ? "订单详情加载中..." : "暂无订单数据"} />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-[#edf1f6] px-5 py-5 text-14 text-[#6b7990] md:flex-row md:items-center md:justify-between md:px-8">
            <span>共 {total} 个订单，第 {page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">上一页</button>
              <button disabled={page >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)} className="h-10 rounded-[12px] border border-[#dfe6ef] px-4 font-semibold text-[#4f5b70] disabled:cursor-not-allowed disabled:opacity-50">下一页</button>
            </div>
          </div>
        </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="订单详情" width="820px">
        {!selected ? null : (
            <div className="space-y-5 p-5">
              <div className="rounded-[18px] border border-[#25364d] bg-[#0b1422] px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-13 font-semibold text-[#7f8fa8]">订单号</p>
                    <h2 className="mt-2 break-all font-mono text-18 font-bold leading-6 text-[#f4f7fb]">{selected.order_no}</h2>
                    <p className="mt-2 text-14 font-semibold text-[#d8e1ec]">{selected.product_name} <span className="text-[#8e99aa]">x{selected.quantity}</span></p>
                </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-13 font-medium ${statusClass[selected.status] || "bg-gray-100 text-gray-500"}`}>{getStatusLabel(selected)}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-13">
                  <DetailItem label="商品类型" value={selected.product_type === "preorder" ? "提前抢购" : "自动发货"} />
                  <DetailItem label="金额" value={formatPrice(selected.total_amount)} emphasis />
                  <DetailItem label="创建时间" value={selected.created_at || "-"} />
                  <DetailItem label="支付时间" value={selected.paid_at || "-"} />
                </div>
              </div>

              <DetailSection title="联系与支付">
                <DetailItem label="联系方式" value={selected.contact_info} />
                <DetailItem label="支付渠道" value={selected.pay_channel || "-"} />
                <DetailItem label="支付流水" value={selected.haozpay_seq_id || "-"} wide />
                <DetailItem label="退款状态" value={selected.refund_available ? "可发起退款" : selected.refund_unavailable_reason || "暂无退款操作"} />
                <DetailItem label="检查时间" value={selected.refund_checked_at || "-"} />
              </DetailSection>

              {selected.product_type === "preorder" && (
                <DetailSection title="发货内容">
                  <DetailItem label="发货时间" value={selected.delivered_at || "-"} />
                  <div className="col-span-2 rounded-[14px] border border-[#1f2d44] bg-[#111b2b] px-4 py-4">
                    <p className="text-13 font-semibold text-[#7f8fa8]">发货信息</p>
                    <p className="mt-3 whitespace-pre-wrap break-words font-mono text-14 leading-7 text-[#f4f7fb]">
                      {selected.delivery_info?.trim() || "暂无发货内容"}
                    </p>
                  </div>
                </DetailSection>
              )}

              {selected.product_type !== "preorder" && (
              <DetailSection title="卡密">
                <div className="col-span-2">
                  <div className="mb-3 flex justify-end">
                    <button onClick={copyCodes} disabled={!selected.codes?.length} className="h-8 rounded-[10px] border border-[#dfe6ef] px-3 text-13 font-semibold text-primary-600 disabled:opacity-45">复制全部</button>
                  </div>
                  <div className="space-y-2">
                    {selected.codes?.length ? selected.codes.map((code) => (
                      <div key={code.id} className="break-all rounded-[12px] border border-[#1f2d44] bg-[#111b2b] p-3 font-mono text-13 text-[#d8e1ec]">
                        {code.code_value}
                      </div>
                    )) : (
                      <div className="rounded-[12px] border border-dashed border-[#25364d] p-5 text-center text-14 text-[#8e99aa]">暂无卡密</div>
                    )}
                    </div>
                </div>
              </DetailSection>
              )}

              <div className="flex gap-2 border-t border-[#25364d] pt-4">
                {canDeliverOrder(selected) && (
                  <button onClick={() => openDeliveryModal(selected)} className="h-10 flex-1 rounded-[12px] bg-success-500 px-4 text-14 font-semibold text-white hover:bg-success-600">
                    发货
                  </button>
                )}
                {selected.product_type !== "preorder" && (
                <button onClick={() => setResendTarget(selected)} disabled={!canResendCodes(selected)} className="h-10 flex-1 rounded-[12px] bg-primary-500 px-4 text-14 font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50">
                  补发卡密
                </button>
                )}
                {canRefundOrder(selected) && (
                  <button onClick={() => setRefundTarget(selected)} className="h-10 flex-1 rounded-[12px] bg-danger-500 px-4 text-14 font-semibold text-white hover:bg-danger-600">
                    退款
                  </button>
                )}
              </div>
            </div>
        )}
      </Drawer>

      <Modal open={!!deliveryTarget} onClose={() => { setDeliveryTarget(null); setDeliveryInfo("") }} title="填写发货信息" className="md:max-w-[520px]">
        <div className="space-y-4">
          <div className="rounded-[14px] bg-[#f8fbff] px-4 py-3 text-14 text-[#5d6675]">
            <p className="font-semibold text-[#111827]">{deliveryTarget?.product_name} x{deliveryTarget?.quantity}</p>
            <p className="mt-1 break-all">订单号：{deliveryTarget?.order_no}</p>
          </div>
          <label className="block space-y-2 text-14 font-medium text-[#3f495b]">
            <span>发货信息</span>
            <textarea
              value={deliveryInfo}
              onChange={(event) => setDeliveryInfo(event.target.value)}
              maxLength={2000}
              className="min-h-[150px] w-full resize-y rounded-[12px] border border-[#dfe6ef] bg-white px-4 py-3 text-14 leading-6 outline-none focus:border-primary-500"
              placeholder="填写发货内容、兑换链接、账号信息、备注等"
            />
          </label>
          <div className="flex justify-end gap-3 border-t border-[#edf1f6] pt-4">
            <button type="button" onClick={() => { setDeliveryTarget(null); setDeliveryInfo("") }} className="h-10 rounded-[12px] border border-[#dfe6ef] px-5 text-14 font-semibold text-[#4f5b70] hover:bg-[#f8fbff]">
              取消
            </button>
            <button type="button" onClick={deliver} disabled={delivering || !deliveryInfo.trim()} className="h-10 rounded-[12px] bg-success-500 px-6 text-14 font-semibold text-white hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-50">
              {delivering ? "发货中" : "确认发货"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!resendTarget}
        onClose={() => setResendTarget(null)}
        onConfirm={resend}
        title="确认补发"
        message={resendTarget ? `确定为订单 ${resendTarget.order_no} 补发缺失卡密吗？` : ""}
        confirmText="补发"
        loading={resending}
      />

      <ConfirmDialog
        open={!!refundTarget}
        onClose={() => setRefundTarget(null)}
        onConfirm={requestRefund}
        title="确认退款"
        message={getRefundMessage(refundTarget)}
        confirmText="退款"
        danger
        loading={refunding}
      />

      <ConfirmDialog
        open={!!forceRefundTarget}
        onClose={() => setForceRefundTarget(null)}
        onConfirm={() => refund(forceRefundTarget, true)}
        title="强制退款确认"
        message={forceRefundTarget ? `商品已发出，是否对订单 ${forceRefundTarget.order_no} 强制退款？` : ""}
        confirmText="强制退款"
        danger
        loading={refunding}
      />
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-[#25364d] bg-[#0b1422] px-5 py-5">
      <h3 className="text-15 font-bold text-[#f4f7fb]">{title}</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 text-14">{children}</div>
    </section>
  )
}

function DetailItem({ label, value, emphasis = false, wide = false }: { label: string; value: string; emphasis?: boolean; wide?: boolean }) {
  return (
    <div className={`rounded-[14px] border border-[#1f2d44] bg-[#111b2b] px-4 py-3 ${wide ? "col-span-2" : ""}`}>
      <p className="text-12 font-semibold text-[#7f8fa8]">{label}</p>
      <p className={`mt-2 break-words text-14 leading-6 ${emphasis ? "font-bold text-danger-500" : "font-semibold text-[#d8e1ec]"}`}>{value}</p>
    </div>
  )
}
