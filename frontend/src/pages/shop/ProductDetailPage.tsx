import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { QRCodeSVG } from "qrcode.react"
import api from "@/api/client"
import { getProductDetail } from "@/api/shop"
import { useAuth } from "@/hooks/useAuth"
import { formatPrice, resolveAssetUrl } from "@/lib/utils"
import { MobileHomeIndicator } from "@/components/shop/MobilePhoneFrame"
import { useToast } from "@/components/ui/Toast"
import { useLanguage } from "@/context/LanguageContext"
import { useOrderPaymentMonitor } from "@/hooks/useOrderPaymentMonitor"
import type { ProductDetail } from "@/types/common"

interface PayInfo {
  pay_type: number
  html_form?: string | null
  qr_url?: string | null
  qr_content?: string | null
}

interface CreatedOrder {
  order_no: string
  status?: string
  total_amount: string
  pay_info: PayInfo
}

function getOrderErrorMessage(err: any) {
  return err.response?.data?.detail?.msg || err.response?.data?.msg || "下单失败"
}

function clampQuantity(value: number, stock: number) {
  const max = Math.max(1, stock)
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(max, Math.floor(value)))
}

export default function ProductDetailPage() {
  const { st, t } = useLanguage()
  const { addToast } = useToast()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [contactInfo, setContactInfo] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payStatus, setPayStatus] = useState<"idle" | "polling" | "paid" | "timeout">("idle")
  const [imageFailed, setImageFailed] = useState(false)
  const cashierUrl = createdOrder?.pay_info.qr_content || createdOrder?.pay_info.qr_url
  const userEmail = user?.email?.trim() || ""
  const shouldUseAccountEmail = Boolean(userEmail)

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

  useOrderPaymentMonitor({
    orderNo: createdOrder?.order_no,
    enabled: Boolean(createdOrder && payDialogOpen && payStatus !== "paid" && payStatus !== "timeout"),
    onPaid: () => setPayStatus("paid"),
    onCancelled: () => {
      setPayStatus("timeout")
      setError(st("订单已取消，如已付款请联系客服处理"))
    },
    onTimeout: () => setPayStatus("timeout"),
  })

  const total = useMemo(() => {
    if (!product) return "0.00"
    return (Number(product.price) * quantity).toFixed(2)
  }, [product, quantity])

  useEffect(() => {
    if (!product) return
    setQuantity(current => clampQuantity(current, product.available_stock))
  }, [product])

  const buy = async () => {
    if (!product) return
    if (product.available_stock <= 0 || !product.is_on_sale) return
    if (quantity > product.available_stock) {
      setQuantity(clampQuantity(quantity, product.available_stock))
      addToast({ type: "warning", message: `${st("库存仅有")} ${product.available_stock} ${st("件")}` })
      return
    }
    const trimmedContactInfo = shouldUseAccountEmail ? userEmail : contactInfo.trim()
    if (!trimmedContactInfo) {
      setError(st("请填写联系方式"))
      return
    }
    if (trimmedContactInfo.length < 6 || trimmedContactInfo.length > 200) {
      setError(st("联系方式需为 6-200 个字符"))
      return
    }
    setError("")
    setCreatedOrder(null)
    setPayStatus("idle")
    setPayDialogOpen(true)
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
      setPayStatus(data.status === "paid" ? "paid" : "polling")
    } catch (err: any) {
      const rawMessage = getOrderErrorMessage(err)
      const message = st(rawMessage)
      setError(message)
      setPayDialogOpen(false)
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
  const soldOut = product.available_stock <= 0 || !product.is_on_sale
  const isPreorder = product.product_type === "preorder"
  const deliveryLabel = isPreorder ? st("提前抢购") : st("自动发卡")
  const fulfillmentLabel = isPreorder ? st("人工发货") : st("付款后自动发卡")
  const purchaseLabel = soldOut ? t("common.outOfStock") : st("立即购买")
  const canDecreaseQuantity = !soldOut && quantity > 1
  const canIncreaseQuantity = !soldOut && quantity < product.available_stock
  const quantityButtonClass = (enabled: boolean) =>
    "flex items-center justify-center border border-[#d1def0] font-medium transition " + (
      enabled
        ? "bg-[#2663eb] text-white hover:bg-[#1f57d6]"
        : "cursor-not-allowed bg-white text-[#b8c3d4]"
    )
  const showQuantityWarning = (message: string) => addToast({ type: "warning", message })
  const getStockLimitMessage = (stock: number) => `${st("库存仅有")} ${stock} ${st("件")}`
  const updateQuantity = (nextValue: number) => {
    if (soldOut) return
    if (!Number.isFinite(nextValue)) {
      setQuantity(1)
      return
    }
    if (nextValue < 1) {
      setQuantity(1)
      showQuantityWarning(st("至少选择一件"))
      return
    }
    if (nextValue > product.available_stock) {
      setQuantity(clampQuantity(nextValue, product.available_stock))
      showQuantityWarning(getStockLimitMessage(product.available_stock))
      return
    }
    setQuantity(clampQuantity(nextValue, product.available_stock))
  }

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
          <span className="rounded-full bg-[#e8faf4] px-4 py-2 text-[13px] font-medium text-[#08a678]">{deliveryLabel}</span>
          <span className="rounded-full bg-[#fff6df] px-4 py-2 text-[13px] font-medium text-[#f09e1f]">{st("库存")} {product.available_stock}</span>
          <span className="rounded-full bg-[#fff1f1] px-4 py-2 text-[13px] font-medium text-[#ec3c30]">{st("已售")} {product.sold_count ?? 0}</span>
          <span className="rounded-full bg-[#ebf2ff] px-4 py-2 text-[13px] font-medium text-[#0e4beb]">{st("售后在线")}</span>
        </div>

        <div className="mt-6">
          {shouldUseAccountEmail ? (
            <div className="rounded-[14px] border border-[#dfe5ed] bg-[#fafbfd] px-4 py-3">
              <p className="text-[13px] font-medium text-[#6b7990]">{st("下单联系方式")}</p>
              <p className="mt-1 break-all text-[15px] font-semibold text-[#111827]">{userEmail}</p>
            </div>
          ) : (
            <input
              value={contactInfo}
              onChange={event => setContactInfo(event.target.value)}
              placeholder={st("填写联系方式，后续可凭它查询卡密")}
              className="h-[52px] w-full rounded-[12px] border border-[#dfe5ed] bg-[#fafbfd] px-4 text-[15px] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]"
            />
          )}
          {error && <p className="mt-3 text-[14px] text-[#ec3c30]">{error}</p>}
        </div>

        <div className="mt-6 flex h-[60px] items-center rounded-[14px] border border-[#dfe5ed] bg-white px-5">
          <div>
            <h2 className="text-[16px] font-bold text-[#0e131e]">{st("购买数量")} <span className="ml-2 text-[13px] font-normal text-[#6b7990]">{st("可多件购买")}</span></h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" disabled={soldOut} onClick={() => updateQuantity(quantity - 1)} className={quantityButtonClass(canDecreaseQuantity) + " size-9 rounded-[10px] text-[20px]"}>-</button>
            <input
              type="number"
              min={1}
              max={Math.max(1, product.available_stock)}
              step={1}
              disabled={soldOut}
              value={quantity}
              onChange={event => updateQuantity(Number(event.target.value))}
              onBlur={() => updateQuantity(quantity)}
              className="h-9 w-[54px] rounded-[10px] border border-[#d1def0] bg-white text-center text-[18px] font-semibold outline-none focus:border-[#0e4beb] disabled:cursor-not-allowed disabled:text-[#b8c3d4]"
            />
            <button type="button" disabled={soldOut} onClick={() => updateQuantity(quantity + 1)} className={quantityButtonClass(canIncreaseQuantity) + " size-9 rounded-[10px] text-[20px]"}>+</button>
          </div>
        </div>
      </section>

      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-[#dfe5ed] bg-white px-7 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-[34px] font-bold text-[#ec3c30]">{formatPrice(total)}</p>
          <button onClick={buy} disabled={submitting || soldOut} className={"h-[64px] w-[228px] rounded-[14px] text-[18px] font-medium text-white shadow-[0_8px_22px_-8px_rgba(10,18,31,0.28)] disabled:cursor-not-allowed " + (soldOut ? "bg-[#b85b5b] shadow-[0_12px_28px_-14px_rgba(184,91,91,0.55)]" : "bg-[#0e4beb] disabled:bg-[#94a3b8] disabled:shadow-none")}>
            {submitting ? st("处理中...") : purchaseLabel}
          </button>
        </div>
        <div className="mt-5">
          <MobileHomeIndicator />
        </div>
      </div>
    </div>

    <div className="hidden pb-20 md:block">
      <section className="mx-auto w-[min(86vw,1320px)] px-6 pt-12 md:px-0 md:pt-[clamp(46px,3.05vw,68px)]">
        <div className="min-h-[clamp(620px,38vw,760px)] rounded-[28px] border border-[#dfe5ed] bg-white p-[clamp(28px,2.4vw,52px)] shadow-[0_24px_58px_-20px_rgba(10,18,31,0.2)]">
          <div className="grid h-full min-w-0 items-stretch gap-[clamp(28px,3vw,56px)] xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
            <div className="flex min-w-0 flex-col">
              <div className="relative flex h-[clamp(360px,26vw,520px)] items-center justify-center overflow-hidden rounded-[24px] bg-[#ebf2ff] text-[42px] font-bold tracking-wide text-[#0e4beb]">
                {showImage ? (
                  <img src={coverImage} alt={product.name} className="absolute inset-0 h-full w-full object-cover" onError={() => setImageFailed(true)} />
                ) : (
                  "VIP CARD"
                )}
                <div className="absolute bottom-6 left-6 flex gap-3">
                  <span className="rounded-full bg-[#e8faf4] px-4 py-2 text-[13px] font-medium tracking-normal text-[#08a678]">{deliveryLabel}</span>
                  <span className="rounded-full bg-[#fff6df] px-4 py-2 text-[13px] font-medium tracking-normal text-[#f09e1f]">{st("库存")} {product.available_stock}</span>
                  <span className="rounded-full bg-[#fff1f1] px-4 py-2 text-[13px] font-medium tracking-normal text-[#ec3c30]">{st("已售")} {product.sold_count ?? 0}</span>
                  <span className="rounded-full bg-white/80 px-4 py-2 text-[13px] font-medium tracking-normal text-[#0e4beb]">{st("售后在线")}</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="rounded-[16px] border border-[#dfe5ed] bg-[#fafbfd] px-5 py-5">
                  <p className="text-[13px] text-[#737d8f]">{st("发货方式")}</p>
                  <p className="mt-2 text-[16px] font-semibold text-[#0e131e]">{fulfillmentLabel}</p>
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

            <div className="flex min-h-full min-w-0 flex-col">
              <div className="flex min-w-0 items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#6b7990]">{st("Digital card")}</p>
                  <h1 className="mt-3 break-words text-[clamp(30px,2.1vw,38px)] font-bold leading-tight text-[#0e131e]">{product.name}</h1>
                </div>
                <p className="shrink-0 text-[clamp(30px,2.1vw,38px)] font-bold leading-tight text-[#ec3c30]">{formatPrice(total)}</p>
              </div>

              <p className="mt-5 max-w-[560px] text-[17px] leading-7 text-[#5c697d]">
                {product.description || st("无需登录，填写联系方式后即可购买；付款后自动显示卡密，并可用于查询订单。")}
              </p>

              <div className="mt-10 min-w-0 rounded-[22px] border border-[#dfe5ed] bg-[#f8fbff] p-7">
                {shouldUseAccountEmail ? (
                  <div>
                    <p className="block text-[15px] font-medium text-[#404a5c]">{st("下单联系方式")}</p>
                    <div className="mt-3 rounded-[14px] border border-[#d6e0f0] bg-white px-5 py-4">
                      <p className="text-[13px] text-[#737d8f]">{st("已登录，默认使用账号邮箱")}</p>
                      <p className="mt-2 break-all text-[15px] font-semibold text-[#111827]">{userEmail}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[15px] font-medium text-[#404a5c]">{st("联系方式（免登录购买）")}</label>
                    <input
                      value={contactInfo}
                      onChange={event => setContactInfo(event.target.value)}
                      placeholder={st("填写手机号 / 微信 / QQ，后续可凭它查询卡密")}
                      className="mt-3 h-[56px] w-full rounded-[14px] border border-[#d6e0f0] bg-white px-5 text-[15px] outline-none placeholder:text-[#9aa6ba] focus:border-[#0e4beb]"
                    />
                  </div>
                )}

                <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
                  <div className="min-w-[210px]">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[17px] font-semibold text-[#0e131e]">{st("购买数量")}</h2>
                      <span className="text-[14px] text-[#737d8f]">{st("可多件购买")}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button type="button" disabled={soldOut} onClick={() => updateQuantity(quantity - 1)} className={quantityButtonClass(canDecreaseQuantity) + " size-11 rounded-[12px] text-[24px]"}>-</button>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, product.available_stock)}
                        step={1}
                        disabled={soldOut}
                        value={quantity}
                        onChange={event => updateQuantity(Number(event.target.value))}
                        onBlur={() => updateQuantity(quantity)}
                        className="h-11 w-[64px] rounded-[12px] border border-[#d1def0] bg-white text-center text-[19px] font-semibold outline-none focus:border-[#0e4beb] disabled:cursor-not-allowed disabled:text-[#b8c3d4]"
                      />
                      <button type="button" disabled={soldOut} onClick={() => updateQuantity(quantity + 1)} className={quantityButtonClass(canIncreaseQuantity) + " size-11 rounded-[12px] text-[22px]"}>+</button>
                    </div>
                  </div>

                  <button onClick={buy} disabled={submitting || soldOut} className={"h-[54px] min-w-[180px] flex-1 rounded-[14px] px-10 text-[16px] font-semibold text-white disabled:cursor-not-allowed sm:flex-none " + (soldOut ? "bg-[#b85b5b] shadow-[0_12px_28px_-14px_rgba(184,91,91,0.55)]" : "bg-[#0e4beb] shadow-[0_12px_28px_-12px_rgba(14,75,235,0.7)] disabled:bg-[#94a3b8] disabled:shadow-none")}>
                    {submitting ? st("处理中...") : purchaseLabel}
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

      {payDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1220]/55 px-5 py-8 backdrop-blur-sm">
          <div className="relative w-full max-w-[430px] rounded-[24px] bg-[#101827] p-6 text-white shadow-[0_28px_70px_-24px_rgba(10,18,31,0.55)]">
            <button
              type="button"
              onClick={() => setPayDialogOpen(false)}
              className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-[#f2f5f9] text-[20px] leading-none text-[#64748b] hover:bg-white"
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
              ) : payStatus === "paid" ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[12px] bg-[#f3f6fb] text-[#08a678]">
                  <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-[#c9f0e3] text-[34px] leading-none">✓</span>
                  <span className="text-[14px] font-semibold">{st("支付成功")}</span>
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[12px] bg-[#f3f6fb] text-[#64748b]">
                  <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#d8e1ec] border-t-[#0e4beb]" />
                  <span className="text-[14px] font-semibold">{st("正在生成二维码...")}</span>
                </div>
              )}
            </div>

            <div className="mt-5 rounded-[14px] bg-[#f7f9fc] px-4 py-3">
              <p className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-[#64748b]">
                <span className="shrink-0 text-[13px]">{st("订单号：")}</span>
                {createdOrder ? (
                  <span className="shrink-0 text-[13px] font-semibold text-[#475569]" title={createdOrder.order_no}>
                    {createdOrder.order_no}
                  </span>
                ) : (
                  <span className="inline-block h-4 w-40 shrink-0 animate-pulse rounded bg-[#dce5ef] align-middle" />
                )}
              </p>
              <p className="mt-1 text-[13px] text-[#64748b]">
                {st("金额：")}
                {createdOrder ? formatPrice(createdOrder.total_amount) : <span className="inline-block h-4 w-16 animate-pulse rounded bg-[#dce5ef] align-middle" />}
              </p>
            </div>

            {cashierUrl && (
              <a href={cashierUrl} target="_blank" rel="noreferrer" className="mt-5 flex h-11 w-full items-center justify-center rounded-[12px] bg-black text-[15px] font-semibold text-white">
                {st("打开收银台")}
              </a>
            )}

            {!createdOrder && <p className="mt-4 text-center text-[13px] text-[#cbd5e1]">{st("正在生成二维码...")}</p>}
            {createdOrder && payStatus === "polling" && <p className="mt-4 text-center text-[13px] text-[#cbd5e1]">{st("等待支付确认中...")}</p>}
            {payStatus === "paid" && (
              <div className="mt-4 text-center">
                <p className="text-[14px] font-semibold text-[#08a678]">{isPreorder ? st("支付成功，请等待发货") : st("支付成功，卡密已发出")}</p>
                {createdOrder && <Link to={`/orders/${createdOrder.order_no}/success`} className="mt-2 inline-flex text-[14px] font-semibold text-[#7aa2ff]">{isPreorder ? st("查看订单") : st("查看卡密")}</Link>}
              </div>
            )}
            {payStatus === "timeout" && <p className="mt-4 text-center text-[13px] text-[#f09e1f]">{st("支付确认超时，可在订单查询页查看最新状态")}</p>}
          </div>
        </div>
      )}
    </>
  )
}
