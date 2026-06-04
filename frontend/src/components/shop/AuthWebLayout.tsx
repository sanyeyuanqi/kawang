import { Link } from "react-router-dom"
import type { ReactNode } from "react"
import { useLanguage } from "@/context/LanguageContext"

interface AuthWebLayoutProps {
  badge: string
  title: string
  description: string
  children: ReactNode
  cardHeightClassName: string
}

export default function AuthWebLayout({ badge, title, description, children, cardHeightClassName }: AuthWebLayoutProps) {
  const { t } = useLanguage()
  const features = [
    [t("auth.featureAutoTitle"), t("auth.featureAutoDesc")],
    [t("auth.featureQueryTitle"), t("auth.featureQueryDesc")],
    [t("auth.featureSupportTitle"), t("auth.featureSupportDesc")],
  ]

  return (
    <div className="hidden pb-24 pt-[clamp(54px,2.96vw,84px)] md:block">
      <div className="figma-web-container auth-web-grid gap-[clamp(48px,2.82vw,80px)]">
        <section className="auth-web-shell flex min-h-[clamp(600px,31.8vw,760px)] flex-col overflow-hidden rounded-[clamp(18px,1.27vw,36px)] border border-[#d3deec] bg-[#f4f8fc] p-[clamp(34px,2vw,54px)]">
          <div className="auth-web-hero rounded-[clamp(18px,1.04vw,28px)] border border-[#c4d7ef] bg-[#dbeafe] px-[clamp(28px,1.78vw,48px)] py-[clamp(28px,1.62vw,44px)] shadow-[0_16px_40px_-32px_rgba(14,75,235,0.42)]">
            <span className="auth-web-badge inline-flex h-[clamp(27px,1.2vw,34px)] min-w-[clamp(86px,3.81vw,108px)] items-center justify-center rounded-full border border-[#b7cae8] bg-white px-5 text-[clamp(11px,0.46vw,13px)] font-semibold text-[#0b4de3] shadow-[0_8px_18px_-16px_rgba(14,75,235,0.45)]">
              {badge}
            </span>
            <h1 className="mt-[clamp(22px,1.22vw,34px)] text-[clamp(26px,1.55vw,44px)] font-bold leading-none text-[#111827]">
              {title}
            </h1>
            <p className="mt-[clamp(13px,0.7vw,20px)] max-w-[clamp(470px,25.96vw,737px)] text-[clamp(13px,0.7vw,20px)] leading-[1.42] text-[#404a5c]">
              {description}
            </p>

            <div className="mt-[clamp(22px,1.2vw,34px)] flex gap-[clamp(14px,0.85vw,24px)]">
              <Link to="/" className="auth-web-primary-action flex h-[clamp(38px,1.97vw,56px)] w-[clamp(116px,5.57vw,158px)] items-center justify-center rounded-[clamp(9px,0.49vw,14px)] bg-[#111827] text-[clamp(12px,0.56vw,16px)] font-semibold text-white shadow-[0_14px_24px_-20px_rgba(10,18,31,0.45)]">
                {t("auth.browseProducts")}
              </Link>
              <Link to="/orders/query" className="auth-web-secondary-action flex h-[clamp(38px,1.97vw,56px)] w-[clamp(116px,5.57vw,158px)] items-center justify-center rounded-[clamp(9px,0.49vw,14px)] border border-[#bdd0eb] bg-white text-[clamp(12px,0.56vw,16px)] font-semibold text-[#0b4de3] shadow-[0_12px_22px_-18px_rgba(14,75,235,0.38)]">
                {t("auth.queryOrders")}
              </Link>
            </div>
          </div>

          <div className="mt-[clamp(22px,1.25vw,36px)] grid grid-cols-3 gap-[clamp(20px,1.18vw,34px)]">
            {features.map(([itemTitle, itemDesc]) => (
              <div key={itemTitle} className="auth-web-info-card h-[clamp(78px,3.95vw,112px)] rounded-[clamp(11px,0.63vw,18px)] border border-[#dfe5ed] bg-white px-[clamp(18px,1.06vw,30px)] py-[clamp(17px,0.92vw,26px)]">
                <h2 className="text-[clamp(13px,0.7vw,20px)] font-bold leading-none text-[#111827]">{itemTitle}</h2>
                <p className="mt-[clamp(11px,0.56vw,16px)] text-[clamp(10px,0.49vw,14px)] leading-none text-[#6b7990]">{itemDesc}</p>
              </div>
            ))}
          </div>

          <div className="auth-web-flow-card mt-[clamp(36px,2.4vw,70px)] h-[clamp(93px,4.65vw,132px)] rounded-[clamp(13px,0.85vw,24px)] border border-[#dfe5ed] bg-white px-[clamp(24px,1.27vw,36px)] py-[clamp(22px,1.13vw,32px)]">
            <h2 className="text-[clamp(15px,0.85vw,24px)] font-bold leading-none text-[#111827]">{t("auth.purchaseFlow")}</h2>
            <div className="mt-[clamp(20px,1.06vw,30px)] grid grid-cols-4 text-[clamp(11px,0.56vw,16px)] font-semibold text-[#111827]">
              <span>{t("auth.flowChoose")}</span>
              <span>{t("auth.flowPay")}</span>
              <span>{t("auth.flowDelivery")}</span>
              <span>{t("auth.flowQuery")}</span>
            </div>
          </div>
        </section>

        <section className={`${cardHeightClassName} rounded-[clamp(18px,1.27vw,36px)] bg-white px-[clamp(44px,2.26vw,64px)] py-[clamp(42px,2.26vw,64px)] shadow-[0_28px_70px_-28px_rgba(10,18,31,0.22)]`}>
          {children}
        </section>
      </div>
    </div>
  )
}
