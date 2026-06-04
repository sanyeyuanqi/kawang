import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { QRCodeSVG } from "qrcode.react"
import api from "@/api/client"
import { getProductDetail } from "@/api/shop"
import { useAuth } from "@/hooks/useAuth"
import { formatPrice, resolveAssetUrl } from "@/lib/utils"
import { MobileHomeIndicator } from "@/components/shop/MobilePhoneFrame"
import { useLanguage } from "@/context/LanguageContext"
import type { ProductDetail } from "@/types/common"

interface PayInfo {
  pay_type: number
  html_form?: string | null
  qr_url?: string | null
  qr_content?: string | null
}

interface CreatedOrder {
  order_no: string
  total_amount: string
  pay_info: PayInfo
}

interface OrderResult {
  order_no: string
  status: string
}

interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

const POLL_INTERVAL = 5000
const POLL_TIMEOUT = 180000

function getOrderErrorMessage(err: any) {
  return err.response?.data?.detail?.msg || err.response?.data?.msg || "下单失败"
}

export default function ProductDetailPage() {
  const { st } = useLanguage()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [contactInfo, setContactInfo] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)
  const [payStatus, setPayStatus] = useState<"idle" | "polling" | "paid" | "timeout">("idle")
  const [imageFailed, setImageFailed] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cashierUrl = createdOrder?.pay_info.qr_content || createdOrder?.pay_info.qr_url

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setImageFailed(false)
    getProductDetail(id)
      .then((data) => setProduct(data))
      .catch(() => setError(st("商品加载失败")))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!contactInfo && user?.email) setContactInfo(user.email)
  }, [contactInfo, user])

  useEffect(() => {
    if (!createdOrder || payStatus !== "idle") return
    setPayStatus("polling")
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<ApiResponse<OrderResult>>(`/orders/${createdOrder.order_no}/result`)
        if (res.data.data?.status === "paid") {
          setPayStatus("paid")
          clearInterval(pollRef.current)
          clearTimeout(timeoutRef.current)
        }
      } catch {
        setError(st("订单状态查询失败，请稍后在订单查询页查看"))
      }
    }, POLL_INTERVAL)
    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current)
      setPayStatus("timeout")
    }, POLL_TIMEOUT)
    return () => {
      clearInterval(pollRef.current)
      clearTimeout(timeoutRef.current)
    }
  }, [createdOrder, payStatus])

  const total = useMemo(() => {
    if (!product) return "0.00"
    return (Number(product.price) * quantity).toFixed(2)
  }, [product, quantity])

  const buy = async () => {
    if (!product) return
    const trimmedContactInfo = contactInfo.trim()
    if (!trimmedContactInfo) {
      setError(st("请填写联系方式"))
      return
    }
    if (trimmedContactInfo.length < 6 || trimmedContactInfo.length > 32) {
      setError(st("联系方式需为 6-32 个字符"))
      return
    }
    setError("")
    setSubmitting(true)
    try {
      const res = await api.post("/orders", {
        product_id: product.id,
        quantity,
        contact_info: trimmedContactInfo,
        pay_type: 1,
      })
      const data = res.data.data
      sessionStorage.setItem(`pay_info_${data.order_no}`, JSON.stringify(data.pay_info))
      setCreatedOrder(data)
      setPayStatus("idle")
    } catch (err: any) {
      const rawMessage = getOrderErrorMessage(err)
      const message = st(rawMessage)
      setError(message)
      if (rawMessage.includes("库存不足") && id) {
        try {
          const latestProduct = await getProductDetail(id)
          if (latestProduct) {
            setProduct(latestProduct)
            setQuantity(current => Math.max(1, Math.min(current, latestProduct.available_stock || 1)))
          }
        } catch {
          // Keep the stock error visible even if the refresh request fails.
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="figma-web-container px-6 py-12 text-[#6b7990] md:px-0">{st("加载中...")}</div>
  if (!product) return <div className="figma-web-container px-6 py-12 text-[#6b7990] md:px-0">{st("商品不存在")}</div>
  const coverImage = resolveAssetUrl(product.cover_image)
  const showImage = Boolean(coverImage && !imageFailed)

  return (
    <>
    <div className="mx-auto min-h-[100svh] w-full max-w-[430px] bg-white pb-36 md:hidden">
      <section className="relative h-[315px] bg-[#0e131e]">
        <Link to="/" className="absolute left-8 top-12 text-[38px] font-bold leading-none text-white">‹</Link>
        <div className="absolute left-1/2 top-[100px] flex h-[156px] w-[290px] -translate-x-1/2 items-center justify-center overflow-hidden rounded-[24px] bg-[#ebf2ff] text-[30px] font-bold text-[#0e4beb]">
          {showImage ? (
            <img src={coverImage} alt={product.name} className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
          ) : (
            "VIP CARD"
          )}
        </div>
      </section>

      <section className="px-6 pt-9">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-[30px] font-bold leading-tight text-[#0e131e]">{product.name}</h1>
            <p className="mt-3 text-[16px] leading-[22px] text-[#6b7990]">
              {product.description || st("无需登录，填写联系方式后即可购买；付款后自动显示卡密，并可用于查询订单。")}
            </p>
          </div>
          <p className="shrink-0 text-[30px] font-bold leading-tight text-[#ec3c30]">{formatPrice(total)}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <span className="rounded-full bg-[#e8faf4] px-4 py-2 text-[13px] font-medium text-[#08a678]">{st("自动发卡")}</span>
          <span className="rounded-full bg-[#fff6df] px-4 py-2 text-[13px] font-medium text-[#f09e1f]">{st("库存")} {product.available_stock}</span>
          <span className="rounded-full bg-[#ebf2ff] px-4 py-2 text-[13px] font-medium text-[#0e4beb]">{st("售后在线")}</span>
        </div>

        <div className="mt-6">
          <input
            value={contactInfo}
            onChange={event => setContactInfo(event.target.value)}
            placeholder={st("填写联系方式，后续可凭它查询卡密")}
            className="h-[52px] w-full rounded-[12px] border border-[#dfe5ed] bg-[#fafbfd] px-4 text-[15px] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]"
          />
          {error && <p className="mt-3 text-[14px] text-[#ec3c30]">{error}</p>}
        </div>

        <div className="mt-6 flex h-[60px] items-center rounded-[14px] border border-[#dfe5ed] bg-white px-5">
          <div>
            <h2 className="text-[16px] font-bold text-[#0e131e]">{st("购买数量")} <span className="ml-2 text-[13px] font-normal text-[#6b7990]">{st("可多件购买")}</span></h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="flex size-9 items-center justify-center rounded-[10px] border border-[#d1def0] bg-[#f5f8fe] text-[20px] font-medium text-[#4f6380]">-</button>
            <div className="flex h-9 w-[48px] items-center justify-center rounded-[10px] border border-[#d1def0] bg-white text-[18px] font-semibold">{quantity}</div>
            <button onClick={() => setQuantity(Math.min(product.available_stock || 1, quantity + 1))} className="flex size-9 items-center justify-center rounded-[10px] bg-[#2663eb] text-[20px] font-medium text-white">+</button>
          </div>
        </div>
      </section>

      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-[#dfe5ed] bg-white px-7 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-[34px] font-bold text-[#ec3c30]">{formatPrice(total)}</p>
          <button onClick={buy} disabled={submitting || product.available_stock <= 0} className="h-[64px] w-[228px] rounded-[14px] bg-[#0e4beb] text-[18px] font-medium text-white shadow-[0_8px_22px_-8px_rgba(10,18,31,0.28)] disabled:opacity-60">
            {submitting ? st("处理中...") : st("立即购买")}
          </button>
        </div>
        <div className="mt-5">
          <MobileHomeIndicator />
        </div>
      </div>
    </div>

    <div className="hidden pb-20 md:block">
      <section className="mx-auto w-[min(74vw,1640px)] px-6 pt-12 md:px-0 md:pt-[clamp(46px,3.05vw,68px)]">
        <div className="min-h-[clamp(620px,38vw,760px)] rounded-[28px] border border-[#dfe5ed] bg-white p-[clamp(38px,2.85vw,64px)] shadow-[0_24px_58px_-20px_rgba(10,18,31,0.2)]">
          <div className="grid h-full items-stretch gap-[clamp(44px,4vw,78px)] lg:grid-cols-[minmax(520px,1.04fr)_minmax(460px,0.88fr)]">
            <div className="flex flex-col">
              <div className="relative flex h-[clamp(430px,27vw,560px)] items-center justify-center overflow-hidden rounded-[24px] bg-[#ebf2ff] text-[42px] font-bold tracking-wide text-[#0e4beb]">
                {showImage ? (
                  <img src={coverImage} alt={product.name} className="absolute inset-0 h-full w-full object-cover" onError={() => setImageFailed(true)} />
                ) : (
                  "VIP CARD"
                )}
                <div className="absolute bottom-6 left-6 flex gap-3">
                  <span className="rounded-full bg-[#e8faf4] px-4 py-2 text-[13px] font-medium tracking-normal text-[#08a678]">{st("自动发卡")}</span>
                  <span className="rounded-full bg-[#fff6df] px-4 py-2 text-[13px] font-medium tracking-normal text-[#f09e1f]">{st("库存")} {product.available_stock}</span>
                  <span className="rounded-full bg-white/80 px-4 py-2 text-[13px] font-medium tracking-normal text-[#0e4beb]">{st("售后在线")}</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="rounded-[16px] border border-[#dfe5ed] bg-[#fafbfd] px-5 py-5">
                  <p className="text-[13px] text-[#737d8f]">{st("发货方式")}</p>
                  <p className="mt-2 text-[16px] font-semibold text-[#0e131e]">{st("付款后自动发卡")}</p>
                </div>
                <div className="rounded-[16px] border border-[#dfe5ed] bg-[#fafbfd] px-5 py-5">
                  <p className="text-[13px] text-[#737d8f]">{st("查询方式")}</p>
                  <p className="mt-2 text-[16px] font-semibold text-[#0e131e]">{st("联系方式 / 订单号")}</p>
                </div>
                <div className="rounded-[16px] border border-[#dfe5ed] bg-[#fafbfd] px-5 py-5">
                  <p className="text-[13px] text-[#737d8f]">{st("购买门槛")}</p>
                  <p className="mt-2 text-[16px] font-semibold text-[#0e131e]">{st("无需注册登录")}</p>
                </div>
              </div>
            </div>

            <div className="flex min-h-full flex-col">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#6b7990]">{st("Digital card")}</p>
                  <h1 className="mt-3 text-[38px] font-bold leading-tight text-[#0e131e]">{product.name}</h1>
                </div>
                <p className="shrink-0 text-[38px] font-bold leading-tight text-[#ec3c30]">{formatPrice(total)}</p>
              </div>

              <p className="mt-5 max-w-[560px] text-[17px] leading-7 text-[#5c697d]">
                {product.description || st("无需登录，填写联系方式后即可购买；付款后自动显示卡密，并可用于查询订单。")}
              </p>

              <div className="mt-10 rounded-[22px] border border-[#dfe5ed] bg-[#f8fbff] p-7">
                <label className="block text-[15px] font-medium text-[#404a5c]">{st("联系方式（免登录购买）")}</label>
                <input
                  value={contactInfo}
                  onChange={event => setContactInfo(event.target.value)}
                  placeholder={st("填写手机号 / 微信 / QQ，后续可凭它查询卡密")}
                  className="mt-3 h-[56px] w-full rounded-[14px] border border-[#d6e0f0] bg-white px-5 text-[15px] outline-none placeholder:text-[#9aa6ba] focus:border-[#0e4beb]"
                />

                <div className="mt-8 flex items-end justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-[17px] font-semibold text-[#0e131e]">{st("购买数量")}</h2>
                      <span className="text-[14px] text-[#737d8f]">{st("可多件购买")}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="flex size-11 items-center justify-center rounded-[12px] border border-[#d1def0] bg-white text-[24px] font-medium text-[#4f6380]">-</button>
                      <div className="flex h-11 w-[64px] items-center justify-center rounded-[12px] border border-[#d1def0] bg-white text-[19px] font-semibold">{quantity}</div>
                      <button onClick={() => setQuantity(Math.min(product.available_stock || 1, quantity + 1))} className="flex size-11 items-center justify-center rounded-[12px] bg-[#2663eb] text-[22px] font-medium text-white">+</button>
                    </div>
                  </div>

                  <button onClick={buy} disabled={submitting || product.available_stock <= 0} className="h-[54px] min-w-[180px] rounded-[14px] bg-[#0e4beb] px-10 text-[16px] font-semibold text-white shadow-[0_12px_28px_-12px_rgba(14,75,235,0.7)] disabled:opacity-60">
                    {submitting ? st("处理中...") : st("立即购买")}
                  </button>
                </div>

                {error && <p className="mt-4 text-[14px] text-[#ec3c30]">{error}</p>}
              </div>

              <div className="mt-7 rounded-[18px] border border-[#dfe5ed] bg-white px-6 py-5">
                <h2 className="text-[18px] font-bold text-[#0e131e]">{st("购买须知")}</h2>
                <p className="mt-2 text-[15px] leading-6 text-[#6b7990]">
                  {st("虚拟商品无需登录即可购买，付款后自动发卡。请保存填写的联系方式，后续可凭它查询卡密。")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

      {createdOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1220]/55 px-5 py-8 backdrop-blur-sm">
          <div className="relative w-full max-w-[430px] rounded-[24px] bg-white p-6 shadow-[0_28px_70px_-24px_rgba(10,18,31,0.55)]">
            <button
              type="button"
              onClick={() => setCreatedOrder(null)}
              className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-[#f2f5f9] text-[20px] leading-none text-[#64748b] hover:bg-[#e8edf5]"
              aria-label={st("关闭支付弹层")}
            >
              ×
            </button>
            <div className="pr-8">
              <h2 className="text-[22px] font-bold text-[#111827]">{st("扫码完成支付")}</h2>
              <p className="mt-2 text-[14px] text-[#6b7990]">{st("请使用收银台二维码完成付款")}</p>
            </div>

            {cashierUrl && (
              <div className="mx-auto mt-6 flex size-[244px] items-center justify-center rounded-[18px] border border-[#e4eaf2] bg-white p-4 shadow-[0_12px_30px_-20px_rgba(10,18,31,0.35)]">
                <QRCodeSVG value={cashierUrl} size={210} />
              </div>
            )}

            <div className="mt-5 rounded-[14px] bg-[#f7f9fc] px-4 py-3">
              <p className="break-all text-[13px] leading-6 text-[#64748b]">{st("订单号：")}{createdOrder.order_no}</p>
              <p className="mt-1 text-[13px] text-[#64748b]">{st("金额：")}{formatPrice(createdOrder.total_amount)}</p>
            </div>

            {cashierUrl && (
              <a href={cashierUrl} target="_blank" rel="noreferrer" className="mt-5 flex h-11 w-full items-center justify-center rounded-[12px] bg-black text-[15px] font-semibold text-white">
                {st("打开收银台")}
              </a>
            )}

            {payStatus === "polling" && <p className="mt-4 text-center text-[13px] text-[#737d8f]">{st("等待支付确认中...")}</p>}
            {payStatus === "paid" && (
              <div className="mt-4 text-center">
                <p className="text-[14px] font-semibold text-[#08a678]">{st("支付成功，卡密已发出")}</p>
                <Link to={`/orders/${createdOrder.order_no}/success`} className="mt-2 inline-flex text-[14px] font-semibold text-[#0e4beb]">{st("查看卡密")}</Link>
              </div>
            )}
            {payStatus === "timeout" && <p className="mt-4 text-center text-[13px] text-[#f09e1f]">{st("支付确认超时，可在订单查询页查看最新状态")}</p>}
          </div>
        </div>
      )}
    </>
  )
}
