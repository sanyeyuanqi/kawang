import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import api from "@/api/client"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { useLanguage } from "@/context/LanguageContext"
import { formatPrice } from "@/lib/utils"

interface OrderResult {
  order_no: string
  status: string
  total_amount: string
  product_name: string
  quantity: number
  codes: { id: number; code_value: string }[]
  paid_at: string | null
}

interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export default function SuccessPage() {
  const { st } = useLanguage()
  const { orderNo } = useParams<{ orderNo: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  useEffect(() => {
    if (!orderNo) return

    api
      .get<ApiResponse<OrderResult>>("/orders/" + orderNo + "/result")
      .then((response) => {
        setOrder(response.data.data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [orderNo])

  const copyAll = async () => {
    if (!order || order.codes.length === 0) return

    const text = order.codes.map((code) => code.code_value).join(String.fromCharCode(10))
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopiedId(null)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const copyOne = async (codeValue: string, codeId: number) => {
    try {
      await navigator.clipboard.writeText(codeValue)
      setCopiedId(codeId)
      setCopied(false)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setCopiedId(null)
    }
  }

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate("/orders/query")
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" label={st("订单结果加载中")} />
      </div>
    )
  }

  if (!order || order.status !== "paid") {
    return (
      <OrderUnavailableState
        orderNo={orderNo}
        st={st}
        onQuery={() => navigate("/orders/query")}
        onHome={() => navigate("/")}
      />
    )
  }

  return (
    <>
      <div className="success-mobile-shell mx-auto min-h-[calc(100svh-72px)] w-full max-w-[430px] bg-[#f8fafc] pb-[120px] md:hidden">
        <section className="success-mobile-hero relative h-[251px] bg-[#0e4beb] px-[30px] pt-[82px] text-white">
          <button
            type="button"
            onClick={goBack}
            className="success-mobile-back absolute left-5 top-5 grid size-10 place-items-center rounded-full border border-white/20 bg-[#1748b7]/80 text-white shadow-none backdrop-blur-sm"
            aria-label={st("返回")}
            title={st("返回")}
          >
            <BackIcon className="size-5" />
          </button>
          <div className="success-mobile-check absolute right-[39px] top-[83px] grid size-[60px] place-items-center rounded-full bg-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M7 12.5l3 3 7-7" stroke="#0e4beb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-[32px] font-bold leading-none">{st("支付成功")}</h1>
          <p className="mt-[14px] text-[17px] leading-none text-[#dbe6ff]">{st("订单已自动发卡，请及时保存卡密")}</p>
        </section>

        <main className="relative z-10 -mt-[53px] px-[30px]">
          <section className="success-mobile-card rounded-[22px] border border-[#dfe5ed] bg-white px-[27px] pb-[67px] pt-[39px] shadow-[0_18px_42px_-20px_rgba(10,18,31,0.22)]">
            <div className="mb-[28px] flex items-center justify-between gap-4">
              <h2 className="success-mobile-title text-[24px] font-bold leading-none text-[#0e131e]">{st("你的卡密")}</h2>
              <span className="success-mobile-status shrink-0 rounded-full bg-[#e8faf4] px-[18px] py-[9px] text-[14px] font-medium leading-none text-success-500">{st("已发卡")}</span>
            </div>

            <div className="success-mobile-code-panel rounded-[14px] border border-[#d8e1ec] bg-[#f8fafc] px-4 py-[35px]">
              {order.codes.length > 0 ? (
                <div className="space-y-4">
                  {order.codes.map((code) => (
                    <div key={code.id} className="success-mobile-code-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[#d8e1ec] bg-white px-4 py-3">
                      <p className="success-mobile-code-value min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[17px] font-bold leading-6 text-[#121722]">
                        {code.code_value}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyOne(code.code_value, code.id)}
                        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#0e4beb] text-white"
                        aria-label={copiedId === code.id ? st("已复制") : st("复制")}
                        title={copiedId === code.id ? st("已复制") : st("复制")}
                      >
                        {copiedId === code.id ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[15px] text-[#6b7990]">{st("暂无卡密")}</p>
              )}
            </div>

            <button
              onClick={copyAll}
              disabled={order.codes.length === 0}
              className="mx-auto mt-[31px] block h-[52px] w-[156px] rounded-[14px] bg-[#0e4beb] text-[16px] font-medium text-white shadow-[0_12px_24px_-14px_rgba(14,75,235,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2663eb] hover:shadow-[0_18px_30px_-16px_rgba(14,75,235,0.9)]"
            >
              {copied ? st("已复制") : st("全部复制")}
            </button>
          </section>

          <section className="success-mobile-instructions mt-[45px]">
            <h3 className="success-mobile-instructions-title mb-[19px] text-[22px] font-bold leading-none text-[#0e131e]">{st("使用说明")}</h3>
            <ol className="success-mobile-instructions-list space-y-[22px] rounded-[20px] border border-[#dfe5ed] bg-white px-[27px] py-[31px] text-[17px] leading-none text-[#0e131e]">
              <li>{st("1. 打开对应平台兑换入口")}</li>
              <li>{st("2. 输入上方卡密完成兑换")}</li>
              <li>{st("3. 有问题可凭订单号联系客服")}</li>
            </ol>
          </section>
        </main>
      </div>

      <div className="success-web-shell hidden h-[calc(100vh-clamp(54px,3.38vw,96px))] overflow-hidden bg-[#f4f7fb] px-6 py-[clamp(14px,1.1vw,22px)] md:block">
        <main className="figma-web-container flex h-full min-h-0 flex-col">
          <section className="success-web-card flex min-h-0 flex-1 flex-col rounded-[28px] border border-[#dfe5ed] bg-white px-[clamp(58px,5vw,98px)] py-[clamp(18px,1.35vw,24px)] shadow-[0_28px_70px_-48px_rgba(10,18,31,0.42)]">
            <button
              type="button"
              onClick={goBack}
              className="success-back-button mb-4 inline-flex h-10 w-fit items-center gap-2 rounded-[12px] border border-[#dfe5ed] bg-white px-4 text-[14px] font-bold text-[#3f495b] transition hover:-translate-y-0.5"
            >
              <BackIcon className="size-4" />
              {st("返回")}
            </button>
            <div className="success-product-panel rounded-[20px] border border-[#cfe0f4] bg-[#f8fbff] p-4">
              <div className="success-product-grid items-start">
                <div className="success-card-art relative overflow-hidden rounded-[14px] bg-[#2f64e8]">
                  <div className="absolute left-[34px] top-[38px] size-[58px] rounded-[16px] bg-[#ff941f]" />
                  <div className="absolute left-[112px] top-[49px] text-[36px] font-black leading-none tracking-[0.02em] text-white">VIP</div>
                  <div className="absolute bottom-0 right-0 h-full w-[46%] rounded-l-[12px] bg-gradient-to-br from-[#6b45ef] to-[#5b3be4]" />
                  <div className="success-art-glow absolute -right-12 -top-12 size-[118px] rounded-full bg-white/10" />
                  <div className="success-art-glow absolute -bottom-16 left-20 size-[160px] rounded-full bg-white/10" />
                </div>

                <div className="success-product-body min-w-0 pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-[24px] font-bold leading-tight text-[#0e131e]">{order.product_name}</h1>
                    <span className="rounded-full bg-[#e8f2ff] px-4 py-1.5 text-[12px] font-bold text-[#0e4beb]">{st("自动发卡")}</span>
                    <span className="rounded-full bg-[#e8faf4] px-4 py-1.5 text-[12px] font-bold text-[#07a577]">{st("已发卡")}</span>
                  </div>
                  <p className="mt-3 max-w-[600px] text-[14px] leading-6 text-[#6b7990]">
                    {st("订单已自动发卡，请及时保存卡密")}
                    <span className="ml-2">{st("数量")}：{order.quantity} {st("件")}</span>
                  </p>
                  <div className="success-order-meta-grid mt-4 grid gap-3 text-[#6b7990]">
                    <div className="success-order-meta success-order-no flex min-w-0 items-center gap-2 rounded-[12px] border border-[#dfe5ed] bg-white px-4 py-2.5">
                      <span className="shrink-0 text-[12px] font-semibold">{st("订单号")}：</span>
                      <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] font-bold text-[#0e131e]" title={order.order_no}>
                        {order.order_no}
                      </strong>
                    </div>
                    <div className="success-order-meta flex min-w-0 items-center gap-2 rounded-[12px] border border-[#dfe5ed] bg-white px-4 py-2.5">
                      <span className="shrink-0 text-[12px] font-semibold">{st("购买时间：")}</span>
                      <strong className="min-w-0 whitespace-nowrap text-[12px] font-semibold text-[#0e131e]">{order.paid_at || "-"}</strong>
                    </div>
                  </div>
                </div>

                <div className="success-product-price pt-3 text-right">
                  <p className="text-[24px] font-black leading-none text-[#e82828]">{formatPrice(order.total_amount)}</p>
                </div>
              </div>
            </div>

            <section className="success-code-panel mt-6 flex min-h-0 w-full flex-1 flex-col rounded-[18px] border border-[#d9e6f5] bg-[#f8fbff] px-[clamp(42px,3.5vw,68px)] pb-5 pt-5">
              <div className="success-code-heading flex items-center justify-between border-b border-[#e8eef6] pb-5">
                <h2 className="text-[22px] font-bold text-[#0e131e]">{st("已发放卡密")}</h2>
                <button
                  type="button"
                  onClick={copyAll}
                  disabled={order.codes.length === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-[#2562eb] px-4 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CopyIcon className="size-4" />
                  {copied ? st("已复制") : st("全部复制")}
                </button>
              </div>

              <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                {order.codes.length > 0 ? (
                  order.codes.map((code, index) => (
                    <div key={code.id} className="success-code-row grid min-h-[44px] grid-cols-[1fr_auto] items-center gap-4 rounded-[10px] border border-[#d9e6f5] bg-white px-7 py-2">
                      <p className="break-all font-mono text-[15px] font-semibold leading-6 text-[#0e131e]">
                        {st("卡密")} {index + 1}：{code.code_value}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyOne(code.code_value, code.id)}
                        className="grid size-8 place-items-center rounded-[8px] bg-[#2562eb] text-white"
                        aria-label={copiedId === code.id ? st("已复制") : st("复制")}
                        title={copiedId === code.id ? st("已复制") : st("复制")}
                      >
                        {copiedId === code.id ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="py-12 text-center text-[15px] text-[#6b7990]">{st("暂无卡密")}</p>
                )}
              </div>

              <p className="mt-4 text-[14px] text-[#8e99aa]">{st("离开页面前请确认已经复制或截图保存。")}</p>
            </section>
          </section>

          <div className="shrink-0 pt-3">
            <p className="text-center text-[13px] text-[#8e99aa]">
              {st("如未收到卡密或支付状态异常，可通过订单查询页查看最新状态，或联系客服。")}
            </p>

            <section className="success-next-steps mt-3 flex w-full items-center rounded-[18px] border border-[#dfe5ed] bg-white px-8 py-4">
              <h3 className="mr-10 text-[16px] font-bold text-[#0e131e]">{st("下一步建议")}</h3>
              <ol className="flex flex-1 items-center justify-between gap-6 text-[13px] text-[#6b7990]">
                <li>{st("1. 复制卡密并前往对应平台兑换")}</li>
                <li>{st("2. 可在订单查询页再次查看订单")}</li>
                <li>{st("3. 如卡密异常，请保留订单号联系客服")}</li>
              </ol>
            </section>
          </div>
        </main>
      </div>

    </>
  )
}

function OrderUnavailableState({
  orderNo,
  st,
  onQuery,
  onHome,
}: {
  orderNo?: string
  st: (text: string) => string
  onQuery: () => void
  onHome: () => void
}) {
  return (
    <main className="order-unavailable-shell min-h-[calc(100svh-72px)] px-5 py-10 md:grid md:place-items-center md:px-6">
      <section className="order-unavailable-card mx-auto w-full max-w-[560px] rounded-[28px] border border-[#dfe5ed] bg-white p-6 text-center shadow-[0_28px_70px_-48px_rgba(10,18,31,0.42)] md:p-8">
        <div className="order-unavailable-icon mx-auto flex size-16 items-center justify-center rounded-[20px] border border-[#dbe5f5] bg-[#f4f8ff] text-[#0e4beb] shadow-[0_16px_34px_-24px_rgba(14,75,235,0.65)]">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" aria-hidden="true">
            <path d="M7.2 7.1 12 4.4l4.8 2.7v5.8L12 15.6 7.2 13V7.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m7.6 7.4 4.4 2.5 4.4-2.5M12 10v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6.6 18.7h10.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>

        <p className="order-unavailable-kicker mt-5 text-[13px] font-bold uppercase tracking-[0.12em] text-[#8b98ad]">{st("订单状态")}</p>
        <h1 className="order-unavailable-title mt-2 text-[26px] font-bold leading-tight text-[#0e131e] md:text-[32px]">{st("订单未支付或不存在")}</h1>
        <p className="order-unavailable-desc mx-auto mt-3 max-w-[420px] text-[15px] leading-7 text-[#5c697d]">
          {st("可以返回订单查询页，用订单号或联系方式重新查询。")}
        </p>

        {orderNo && (
          <div className="order-unavailable-meta mt-6 rounded-[18px] border border-[#dfe5ed] bg-[#f8fbff] px-5 py-4 text-left">
            <p className="text-[13px] font-semibold text-[#8b98ad]">{st("当前订单号")}</p>
            <p className="mt-1 break-all font-mono text-[15px] font-bold text-[#1f2a3d]">{orderNo}</p>
          </div>
        )}

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onQuery}
            className="order-unavailable-primary h-12 rounded-[16px] bg-[#0e4beb] text-[15px] font-bold text-white shadow-[0_16px_34px_-20px_rgba(14,75,235,0.8)] transition hover:bg-[#0b3fc8]"
          >
            {st("查询订单")}
          </button>
          <button
            type="button"
            onClick={onHome}
            className="order-unavailable-secondary h-12 rounded-[16px] border border-[#dfe5ed] bg-white text-[15px] font-bold text-[#3f495b] transition hover:border-[#b8c9e2] hover:bg-[#f8fbff]"
          >
            {st("返回首页")}
          </button>
        </div>
      </section>
    </main>
  )
}

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 8.5V6.8C8 5.8 8.8 5 9.8 5h7.4C18.2 5 19 5.8 19 6.8v7.4c0 1-.8 1.8-1.8 1.8h-1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="8" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 12.5l3.4 3.4 7.6-8.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BackIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
