import { Link } from "react-router-dom"
import { useState } from "react"
import type { Product } from "@/types/common"
import { formatPrice, resolveAssetUrl } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"
import { useToast } from "@/components/ui/Toast"

interface ProductCardProps {
  product: Product
  theme: [string, string]
  appearDelayMs?: number
  animateOnAppear?: boolean
}

export default function ProductCard({ product, theme, appearDelayMs = 0, animateOnAppear = true }: ProductCardProps) {
  const [bg, color] = theme
  const [imageFailed, setImageFailed] = useState(false)
  const { t, st } = useLanguage()
  const { addToast } = useToast()
  const coverImage = resolveAssetUrl(product.cover_image)
  const showImage = Boolean(coverImage && !imageFailed)
  const soldOut = product.available_stock <= 0 || !product.is_on_sale
  const purchaseLabel = soldOut ? t("common.outOfStock") : t("common.buyNow")
  const stockLabel = `${t("common.stock")} ${product.available_stock}`
  const soldLabel = `${st("已售")} ${product.sold_count ?? 0}`
  const cardDescription = (product.description || t("product.defaultDescription"))
    .replace(/自动发卡[，,、\s]*/g, "")
    .replace(/自動發卡[，,、\s]*/g, "")
    .replace(/Auto delivery[,\s]*/gi, "")
    .trim()
  const badges = [
    { label: stockLabel, className: "bg-[#fff6df] text-[#f09e1f]" },
    { label: soldLabel, className: "bg-[#fff1f1] text-[#ec3c30]" },
    { label: t("common.supportOnline"), className: "bg-[#e8f2ff] text-[#0e4beb]" },
  ]

  return (
    <Link
      key={product.id}
      to={`/products/${product.id}`}
      onClick={(event) => {
        if (!soldOut) return
        event.preventDefault()
        addToast({ type: "warning", message: st("商品暂时没有库存") })
      }}
      className={"product-card relative grid min-h-[156px] grid-cols-[96px_1fr_72px] items-center gap-3 overflow-hidden rounded-[20px] border border-[#dfe5ed] bg-white px-4 py-4 shadow-[0_12px_32px_-8px_rgba(10,18,31,0.08)] transition duration-200 ease-out md:block md:min-h-[clamp(292px,16.2vw,372px)] md:rounded-[clamp(14px,0.85vw,24px)] md:p-[clamp(16px,0.9vw,26px)] " + (animateOnAppear ? "product-card-appear " : "") + (soldOut ? "product-card-sold-out cursor-not-allowed" : "group md:hover:-translate-y-1.5 md:hover:border-[#c8d7ea] md:hover:shadow-[0_24px_44px_-18px_rgba(10,18,31,0.28)] md:active:-translate-y-0.5")}
      style={animateOnAppear ? { animationDelay: `${appearDelayMs}ms` } : undefined}
      aria-disabled={soldOut}
    >
      <div className="min-w-0 md:min-w-0">
        <div
          className={"flex size-[96px] items-center justify-center overflow-hidden rounded-[16px] text-[34px] font-bold transition duration-200 ease-out md:h-[clamp(118px,7.25vw,178px)] md:w-full md:rounded-[clamp(12px,0.7vw,20px)] md:text-[clamp(18px,1vw,30px)] " + (soldOut ? "" : "md:group-hover:scale-[1.018]")}
          style={showImage ? undefined : { backgroundColor: bg, color }}
        >
          {showImage ? (
            <img
              src={coverImage}
              alt={product.name}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <>
              <span className="md:hidden">{t("product.cardFallback")}</span>
              <span className="hidden md:inline">CARD</span>
            </>
          )}
        </div>
        <div className="mt-2 hidden flex-wrap gap-2 md:flex">
          {badges.map((badge) => (
            <span key={badge.label} className={`whitespace-nowrap rounded-full px-[clamp(8px,0.49vw,14px)] py-[clamp(3px,0.28vw,8px)] text-[clamp(10px,0.46vw,13px)] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <h3 className={"truncate text-[21px] font-bold transition md:mt-[clamp(14px,0.82vw,24px)] md:text-[clamp(13px,0.78vw,22px)] " + (soldOut ? "text-[#64748b]" : "text-[#0e131e] md:group-hover:text-[#0e4beb]")}>{product.name}</h3>
        <p className={"mt-1 line-clamp-2 text-[14px] leading-5 transition md:min-h-5 md:text-[clamp(10px,0.56vw,16px)] " + (soldOut ? "text-[#94a3b8]" : "text-[#6b7990] md:group-hover:text-[#4f5c70]")}>{cardDescription}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
          {badges.map((badge) => (
            <span key={badge.label} className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          ))}
        </div>
        <span className="mt-2 block text-[24px] font-bold text-[#ec3c30] md:hidden">{product.id === 2 ? `¥50 ${st("起")}` : formatPrice(product.price).replace(".80", ".8")}</span>
      </div>
      <div className="flex h-full flex-col items-end justify-end md:mt-[clamp(12px,0.74vw,22px)] md:h-auto md:w-full md:flex-row md:items-center md:justify-between md:gap-4">
        <span className="hidden text-[24px] font-bold text-[#ec3c30] md:inline md:text-[clamp(14px,0.85vw,24px)]">{formatPrice(product.price)}</span>
        <span className={"hidden h-[clamp(36px,2.08vw,44px)] min-w-[clamp(92px,5.2vw,132px)] items-center justify-center rounded-[clamp(10px,0.56vw,14px)] px-[clamp(16px,0.9vw,24px)] text-[clamp(12px,0.56vw,15px)] font-semibold text-white transition duration-200 ease-out md:inline-flex " + (soldOut ? "bg-[#94a3b8]" : "bg-[#2663eb] shadow-[0_12px_24px_-14px_rgba(38,99,235,0.7)] group-hover:bg-[#1f57d6]")}>
          {purchaseLabel}
        </span>
        <span className={"flex h-11 w-[84px] items-center justify-center rounded-[12px] text-[15px] font-semibold text-white md:hidden " + (soldOut ? "bg-[#94a3b8]" : "bg-[#2663eb]")}>{purchaseLabel}</span>
      </div>
      {soldOut && (
        <div className="sold-out-overlay pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/30 backdrop-blur-[1.5px] backdrop-grayscale">
          <span className="sold-out-typewriter text-[27px] font-semibold text-white drop-shadow-[0_2px_5px_rgba(15,23,42,0.36)] md:text-[clamp(27px,1.32vw,34px)]">
            {st("暂无库存")}
          </span>
        </div>
      )}
    </Link>
  )
}
