import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Link } from "react-router-dom"
import { MobileHomeIndicator } from "@/components/shop/MobilePhoneFrame"
import { shopInfoConfig } from "@/config/shopInfoConfig"
import { useLanguage } from "@/context/LanguageContext"
import { useShopContactConfig } from "@/hooks/useShopContactConfig"

function MiniQr({
  className = "absolute left-[252px] top-[526px]",
  imageSrc = "",
  qrValue,
  size = 86,
}: { className?: string; imageSrc?: string; qrValue: string; size?: number }) {
  const [imageFailed, setImageFailed] = useState(false)
  const scale = size / 86
  const qrStyle = { width: size, height: size, borderRadius: Math.round(10 * scale) }
  const inset = Math.max(8, Math.round(8 * scale))
  const qrSize = Math.max(1, size - inset * 2)

  useEffect(() => {
    setImageFailed(false)
  }, [imageSrc])

  if (imageSrc && !imageFailed) {
    return (
      <div className={`${className} mini-qr overflow-hidden border border-[#c7d6eb] bg-[#f6f8fb]`} style={qrStyle}>
        <img src={imageSrc} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      </div>
    )
  }
  return (
    <div className={`${className} mini-qr overflow-hidden border border-[#c7d6eb] bg-[#f6f8fb] p-2`} style={qrStyle}>
      <div className="flex h-full w-full items-center justify-center rounded bg-white">
        <QRCodeSVG value={qrValue || "ylj3194584108"} size={qrSize} bgColor="#ffffff" fgColor="#111827" level="H" />
      </div>
    </div>
  )
}

export default function AboutPage() {
  const { st } = useLanguage()
  const contactConfig = useShopContactConfig()
  const { brand, aboutHero, storeInfo, serviceCta } = shopInfoConfig
  const contactText = `${st(storeInfo.contact.label)}${contactConfig.customerWechat}`

  return (
    <>
      <div className="mx-auto min-h-[100svh] w-full max-w-[430px] bg-[#f6f8fb] pb-32 md:hidden">
        <main className="px-7 pt-5">
          <section className="rounded-[20px] border border-[#dbe5f5] bg-white px-6 py-8">
            <div className="flex items-center gap-5">
              <MiniQr className="relative shrink-0" imageSrc={contactConfig.qrImageSrc} qrValue={contactConfig.customerWechat} size={112} />
              <div>
                <h2 className="text-[24px] font-bold leading-none text-[#111827]">{st(brand.name)}</h2>
                <p className="mt-3 text-[16px] leading-none text-[#737d8f]">{st(brand.subtitle)}</p>
              </div>
            </div>
            <p className="mt-7 text-[16px] leading-[22px] text-[#404a5c]">{st(brand.description)}</p>
          </section>

          <section className="mt-8 rounded-[20px] border border-[#dbe5f5] bg-white px-6 py-8">
            <h2 className="text-[22px] font-bold leading-none text-[#111827]">{st("店铺信息")}</h2>
            <div className="mt-7 space-y-6 text-[16px] leading-none text-[#404a5c]">
              {storeInfo.operations.items.map((item) => (
                <p key={`${item.label}${item.value}`}>{st(item.label)}{st(item.value)}</p>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[20px] border border-[#dbe5f5] bg-white px-6 py-8">
            <h2 className="text-[22px] font-bold leading-none text-[#111827]">{st(storeInfo.contact.title)}</h2>
            <div className="mt-8">
              <div className="min-w-0">
                <p className="break-all text-[17px] leading-6 text-[#404a5c]">{contactText}</p>
                <p className="mt-6 text-[15px] leading-[22px] text-[#737d8f]">{st(storeInfo.contact.helpText)}</p>
              </div>
            </div>
          </section>
        </main>

        <nav className="fixed bottom-0 left-1/2 z-40 flex h-24 w-full max-w-[430px] -translate-x-1/2 items-start justify-around border-t border-[#dbe5f5] bg-white pt-[10px]">
          <Link to="/" className="flex h-[60px] w-[82px] flex-col items-center justify-center rounded-[20px] text-center text-[#737d8f]">
            <span className="text-[20px] leading-[21px]">⌂</span>
            <span className="mt-[5px] text-[12px] leading-[13px]">{st("首页")}</span>
          </Link>
          <Link to="/announcements" className="flex h-[60px] w-[82px] flex-col items-center justify-center rounded-[20px] text-center text-[#737d8f]">
            <span className="text-[20px] leading-[21px]">!</span>
            <span className="mt-[5px] text-[12px] leading-[13px]">{st("公告")}</span>
          </Link>
          <Link to="/orders/query" className="flex h-[60px] w-[82px] flex-col items-center justify-center rounded-[20px] text-center text-[#737d8f]">
            <span className="text-[20px] leading-[21px]">▤</span>
            <span className="mt-[5px] text-[12px] leading-[13px]">{st("订单")}</span>
          </Link>
          <Link to="/about" className="flex h-[60px] w-[82px] flex-col items-center justify-center rounded-[20px] bg-[#e8f2ff] text-center text-[#2663eb]">
            <span className="text-[20px] leading-[21px]">ⓘ</span>
            <span className="mt-[5px] text-[12px] font-semibold leading-[13px]">{st("关于")}</span>
          </Link>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <MobileHomeIndicator />
          </div>
        </nav>
      </div>

      <div className="hidden pb-[clamp(72px,5vw,120px)] pt-[clamp(50px,2.96vw,64px)] md:block">
        <div className="figma-web-container">
          <section className="relative h-[clamp(190px,11.35vw,232px)] overflow-hidden rounded-[clamp(17px,1.04vw,22px)] bg-[#e1f0ff]">
            <div className="absolute left-[clamp(38px,2.26vw,48px)] top-[clamp(42px,2.45vw,52px)]">
              <h1 className="text-[clamp(29px,1.72vw,36px)] font-bold leading-[1.12] text-[#111827]">{st(aboutHero.title)}</h1>
              <p className="mt-[clamp(10px,0.62vw,13px)] w-[clamp(430px,31.77vw,651px)] text-[clamp(14px,0.83vw,17px)] leading-[1.5] text-[#404a5c]">
                {st(aboutHero.description)}
              </p>
              <span className="mt-[clamp(20px,1.2vw,26px)] inline-flex h-[clamp(24px,1.35vw,28px)] items-center rounded-full bg-white px-[clamp(14px,0.85vw,18px)] text-[clamp(11px,0.62vw,13px)] font-medium text-[#0e4beb]">
                {st(aboutHero.badge)}
              </span>
            </div>

            <div className="absolute right-[clamp(74px,4.8vw,108px)] top-1/2 -translate-y-1/2">
              <MiniQr className="relative shrink-0" imageSrc={contactConfig.qrImageSrc} qrValue={contactConfig.customerWechat} size={132} />
            </div>
          </section>

          <section className="mt-[clamp(58px,3.32vw,68px)]">
            <h2 className="text-[clamp(20px,1.15vw,24px)] font-bold leading-none text-[#111827]">{st("店铺信息")}</h2>
            <div className="mt-[clamp(25px,1.51vw,31px)] grid grid-cols-3 gap-[clamp(34px,2.08vw,43px)]">
              <article className="h-[clamp(224px,12.92vw,265px)] rounded-[clamp(11px,0.68vw,14px)] border border-[#dfe5ed] bg-white px-[clamp(31px,1.77vw,37px)] py-[clamp(34px,2.03vw,42px)]">
                <h3 className="text-[clamp(17px,0.99vw,21px)] font-bold leading-none text-[#111827]">{st(storeInfo.operations.title)}</h3>
                <div className="mt-[clamp(32px,1.88vw,39px)] space-y-[clamp(25px,1.46vw,30px)] text-[clamp(13px,0.73vw,15px)] leading-none text-[#404a5c]">
                  {storeInfo.operations.items.map((item) => (
                    <p key={`${item.label}${item.value}`}>{st(item.label)}{st(item.value)}</p>
                  ))}
                </div>
              </article>

              <article className="relative h-[clamp(224px,12.92vw,265px)] rounded-[clamp(11px,0.68vw,14px)] border border-[#dfe5ed] bg-white px-[clamp(31px,1.77vw,37px)] py-[clamp(34px,2.03vw,42px)]">
                <h3 className="text-[clamp(17px,0.99vw,21px)] font-bold leading-none text-[#111827]">{st(storeInfo.contact.title)}</h3>
                <p className="mt-[clamp(32px,1.88vw,39px)] text-[clamp(13px,0.73vw,15px)] leading-none text-[#404a5c]">{contactText}</p>
                <p className="mt-[clamp(28px,1.56vw,32px)] max-w-[clamp(280px,18vw,360px)] text-[clamp(12px,0.68vw,14px)] leading-[1.45] text-[#737d8f]">
                  {st(storeInfo.contact.helpText)}
                </p>
              </article>

              <article className="h-[clamp(224px,12.92vw,265px)] rounded-[clamp(11px,0.68vw,14px)] border border-[#dfe5ed] bg-white px-[clamp(31px,1.77vw,37px)] py-[clamp(34px,2.03vw,42px)]">
                <h3 className="text-[clamp(17px,0.99vw,21px)] font-bold leading-none text-[#111827]">{st(storeInfo.purchase.title)}</h3>
                <div className="mt-[clamp(32px,1.88vw,39px)] space-y-[clamp(25px,1.46vw,30px)] text-[clamp(13px,0.73vw,15px)] leading-none text-[#404a5c]">
                  {storeInfo.purchase.items.map((item) => (
                    <p key={item}>{st(item)}</p>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="mt-[clamp(38px,2.14vw,44px)] flex h-[clamp(103px,6.04vw,124px)] items-center rounded-[clamp(13px,0.78vw,16px)] bg-[#111827] px-[clamp(42px,2.41vw,50px)]">
            <div>
              <h2 className="text-[clamp(21px,1.25vw,26px)] font-bold leading-none text-white">{st(serviceCta.title)}</h2>
              <p className="mt-[clamp(13px,0.78vw,16px)] text-[clamp(13px,0.73vw,15px)] leading-none text-[#d7deea]">
                {st(serviceCta.description)}
              </p>
            </div>
            <Link
              to="/orders/query"
              className="ml-auto flex h-[clamp(39px,2.14vw,44px)] w-[clamp(98px,5.57vw,114px)] items-center justify-center rounded-[clamp(9px,0.52vw,11px)] bg-white text-[clamp(12px,0.68vw,14px)] font-medium text-[#111827]"
            >
              {st(serviceCta.actionText)}
            </Link>
          </section>
        </div>
      </div>
    </>
  )
}
