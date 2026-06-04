import { useLanguage } from "@/context/LanguageContext"

export default function HomeHero() {
  const { t } = useLanguage()

  return (
    <div className="relative min-h-[210px] overflow-hidden rounded-[26px] bg-[#0e131e] px-7 pb-8 pt-9 shadow-[0_18px_42px_-8px_rgba(10,18,31,0.16)] md:h-[clamp(203px,12.68vw,360px)] md:min-h-0 md:rounded-[clamp(20px,1.27vw,36px)] md:px-[clamp(34px,2.11vw,60px)] md:py-[clamp(40px,2.46vw,70px)]">
      <div>
        <h1 className="text-[38px] font-bold leading-tight text-white md:text-[clamp(35px,2.18vw,62px)]">{t("brand")}</h1>
        <p className="mt-1 max-w-[clamp(416px,25.96vw,737px)] text-[16px] leading-7 text-[#c7d6eb] md:mt-[clamp(4px,0.28vw,8px)] md:text-[clamp(14px,0.85vw,24px)] md:leading-normal">
          {t("common.autoDelivery")} · {t("common.supportOnline")} · {t("common.reliable")}
        </p>
        <div className="mt-7 flex flex-wrap gap-3 md:mt-[clamp(14px,0.85vw,24px)] md:gap-[clamp(8px,0.49vw,14px)]">
          <span className="rounded-full bg-[#eafff7] px-5 py-2 text-[14px] font-medium text-[#08a678] md:bg-[#ebf2ff] md:px-[clamp(11px,0.7vw,20px)] md:py-[clamp(4px,0.28vw,8px)] md:text-[clamp(11px,0.46vw,13px)] md:text-[#0e4beb]">{t("home.stockEnough")}</span>
          <span className="rounded-full bg-[#ebf2ff] px-5 py-2 text-[14px] font-medium text-[#0e4beb] md:px-[clamp(11px,0.7vw,20px)] md:py-[clamp(4px,0.28vw,8px)] md:text-[clamp(11px,0.46vw,13px)]">{t("common.noLoginPurchase")}</span>
        </div>
      </div>
      <div className="absolute right-8 top-10 grid size-14 place-items-center rounded-[18px] bg-[#1551ed] text-[28px] font-bold text-white md:right-[clamp(100px,6.26vw,178px)] md:top-[clamp(34px,2.11vw,60px)] md:h-[clamp(124px,7.75vw,220px)] md:w-[clamp(188px,11.78vw,334px)] md:rounded-[clamp(18px,1.13vw,32px)] md:bg-[#ebf2ff] md:text-[clamp(24px,1.48vw,42px)] md:text-[#0e4beb]">
        川
      </div>
    </div>
  )
}
