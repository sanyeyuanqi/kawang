import { Link } from "react-router-dom"
import { useState } from "react"
import type { Product } from "@/types/common"
import { formatPrice, resolveAssetUrl } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"

interface ProductCardProps {
  product: Product
  theme: [string, string]
}

export default function ProductCard({ product, theme }: ProductCardProps) {
  const [bg, color] = theme
  const [imageFailed, setImageFailed] = useState(false)
  const { t, st } = useLanguage()
  const coverImage = resolveAssetUrl(product.cover_image)
  const showImage = Boolean(coverImage && !imageFailed)
  const stockLabel = `${t("common.stock")} ${product.available_stock}`
  const soldLabel = `${st("已售")} ${product.sold_count ?? 0}`
  const deliveryLabel = product.available_stock > 0 ? t("common.autoDelivery") : t("common.outOfStock")
  const badges = [
    { label: deliveryLabel, className: product.available_stock > 0 ? "bg-[#e8faf4] text-[#08a678]" : "bg-[#f5f7fb] text-[#8b98ad]" },
    { label: stockLabel, className: "bg-[#fff6df] text-[#f09e1f]" },
    { label: soldLabel, className: "bg-[#fff1f1] text-[#ec3c30]" },
    { label: t("common.supportOnline"), className: "bg-[#e8f2ff] text-[#0e4beb]" },
  ]

  return (
    <Link key={product.id} to={`/products/${product.id}`} className="product-card group grid min-h-[156px] grid-cols-[96px_1fr_72px] items-center gap-3 rounded-[20px] border border-[#dfe5ed] bg-white px-4 py-4 shadow-[0_12px_32px_-8px_rgba(10,18,31,0.08)] transition duration-200 ease-out md:block md:min-h-[clamp(292px,16.2vw,372px)] md:rounded-[clamp(14px,0.85vw,24px)] md:p-[clamp(16px,0.9vw,26px)] md:hover:-translate-y-1.5 md:hover:border-[#c8d7ea] md:hover:shadow-[0_24px_44px_-18px_rgba(10,18,31,0.28)] md:active:-translate-y-0.5">
      <div className="min-w-0 md:min-w-0">
        <div
          className="flex size-[96px] items-center justify-center overflow-hidden rounded-[16px] text-[34px] font-bold transition duration-200 ease-out md:h-[clamp(118px,7.25vw,178px)] md:w-full md:rounded-[clamp(12px,0.7vw,20px)] md:text-[clamp(18px,1vw,30px)] md:group-hover:scale-[1.018]"
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
        <h3 className="truncate text-[21px] font-bold text-[#0e131e] transition md:mt-[clamp(14px,0.82vw,24px)] md:text-[clamp(13px,0.78vw,22px)] md:group-hover:text-[#0e4beb]">{product.name}</h3>
        <p className="mt-1 line-clamp-2 text-[14px] leading-5 text-[#6b7990] transition md:min-h-5 md:text-[clamp(10px,0.56vw,16px)] md:group-hover:text-[#4f5c70]">{product.description || t("product.defaultDescription")}</p>
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
        <span className="hidden h-[clamp(36px,2.08vw,44px)] min-w-[clamp(92px,5.2vw,132px)] items-center justify-center rounded-[clamp(10px,0.56vw,14px)] bg-[#2663eb] px-[clamp(16px,0.9vw,24px)] text-[clamp(12px,0.56vw,15px)] font-semibold text-white shadow-[0_12px_24px_-14px_rgba(38,99,235,0.7)] transition duration-200 ease-out group-hover:bg-[#1f57d6] md:inline-flex">
          {t("common.buyNow")}
        </span>
        <span className="flex h-11 w-[60px] items-center justify-center rounded-[12px] bg-[#2663eb] text-[16px] font-semibold text-white md:hidden">{t("common.buy")}</span>
      </div>
    </Link>
  )
}
