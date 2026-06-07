import { useEffect, useState } from "react"
import MobilePhoneFrame from "@/components/shop/MobilePhoneFrame"
import { useLanguage } from "@/context/LanguageContext"
import { getAnnouncements } from "@/api/shop"
import type { Announcement } from "@/types/common"

function announcementDate(item: Announcement) {
  return (item.published_at || item.created_at || "").slice(0, 10)
}

export default function AnnouncementsPage() {
  const { st } = useLanguage()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    getAnnouncements()
      .then(items => {
        if (!cancelled) setAnnouncements(items)
      })
      .catch(() => {
        if (!cancelled) setError(st("公告加载失败，请稍后重试。"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [st])

  return (
    <>
      <MobilePhoneFrame className="bg-[#f6f8fb]" contentClassName="px-7 pt-5 pb-32" showHomeIndicator={false}>
        <section>
          <h1 className="text-[30px] font-bold leading-none text-[#0e131e]">{st("公告")}</h1>
          <p className="mt-3 text-[16px] leading-6 text-[#6b7990]">{st("查看店铺服务状态、订单查询和售后提醒。")}</p>
        </section>

        <section className="mt-8 space-y-5">
          {loading && <div className="h-36 animate-pulse rounded-[20px] border border-[#dbe5f5] bg-white/70" />}
          {!loading && error && <div className="rounded-[20px] border border-[#f1caca] bg-[#fff5f5] px-6 py-5 text-[14px] text-[#b85b5b]">{error}</div>}
          {!loading && !error && announcements.length === 0 && <div className="rounded-[20px] border border-dashed border-[#dbe5f5] bg-white/70 px-6 py-10 text-center text-[14px] text-[#6b7990]">{st("暂无公告")}</div>}
          {announcements.map((item) => (
            <article key={item.id} className="rounded-[20px] border border-[#dbe5f5] bg-white px-6 py-6 shadow-[0_12px_28px_-14px_rgba(10,18,31,0.14)]">
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full bg-[#e8f2ff] px-3 py-1 text-[12px] font-semibold text-[#0e4beb]">{st(item.tag)}</span>
                <time className="text-[12px] font-medium text-[#8b98ad]">{announcementDate(item)}</time>
              </div>
              <h2 className="mt-5 text-[21px] font-bold leading-[28px] text-[#0e131e]">{st(item.title)}</h2>
              <p className="mt-3 text-[15px] leading-[24px] text-[#5c697d]">{st(item.content)}</p>
            </article>
          ))}
        </section>
      </MobilePhoneFrame>

      <div className="hidden pb-[clamp(72px,5vw,120px)] pt-[clamp(46px,2.96vw,84px)] md:block">
        <div className="figma-web-container">
          <section className="relative h-[clamp(206px,12.5vw,256px)] overflow-hidden rounded-[clamp(18px,1.2vw,28px)] border border-[#26364f] bg-[#111827] px-[clamp(42px,2.8vw,68px)] py-[clamp(40px,2.55vw,62px)] shadow-[0_28px_70px_-24px_rgba(0,0,0,0.48)]">
            <div className="flex h-full items-center justify-between gap-8">
              <div>
                <h1 className="text-[clamp(34px,2.03vw,46px)] font-bold leading-none text-white">{st("小野卡铺")}</h1>
                <p className="mt-[clamp(14px,0.88vw,20px)] max-w-[clamp(430px,30vw,650px)] text-[clamp(14px,0.83vw,18px)] leading-[1.55] text-[#f2f6ff]">
                  {st("个人卡网，会员卡券、游戏充值、软件授权自动发卡，免登录即可购买。")}
                </p>
                <div className="mt-[clamp(18px,1.2vw,28px)] flex items-center gap-4">
                  <span className="inline-flex h-[clamp(24px,1.45vw,30px)] items-center rounded-full bg-[#eaf2ff] px-[clamp(14px,0.86vw,18px)] text-[clamp(11px,0.62vw,13px)] font-semibold text-[#0b4de3]">
                    {st("24 小时自动发卡")}
                  </span>
                  <span className="inline-flex h-[clamp(24px,1.45vw,30px)] items-center rounded-full bg-[#eaf2ff] px-[clamp(14px,0.86vw,18px)] text-[clamp(11px,0.62vw,13px)] font-semibold text-[#0b4de3]">
                    {st("免登录购买")}
                  </span>
                </div>
              </div>
              <div className="grid h-[clamp(120px,7.4vw,160px)] w-[clamp(180px,12vw,260px)] shrink-0 place-items-center rounded-[clamp(18px,1.1vw,24px)] border border-[#31496c] bg-[#1c2f4a] text-[clamp(24px,1.6vw,34px)] font-bold tracking-wide text-[#95b8ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                CARD SHOP
              </div>
            </div>
          </section>

          <section className="mt-[clamp(28px,1.8vw,42px)] grid gap-[clamp(18px,1.2vw,28px)]">
            {loading && <div className="h-40 animate-pulse rounded-[22px] border border-[#dfe5ed] bg-white/70" />}
            {!loading && error && <div className="rounded-[22px] border border-[#f1caca] bg-[#fff5f5] px-8 py-6 text-[#b85b5b]">{error}</div>}
            {!loading && !error && announcements.length === 0 && <div className="rounded-[22px] border border-dashed border-[#dfe5ed] bg-white/70 px-8 py-14 text-center text-[#6b7990]">{st("暂无公告")}</div>}
            {announcements.map((item) => (
              <article key={item.id} className="rounded-[22px] border border-[#dfe5ed] bg-white px-[clamp(30px,1.9vw,44px)] py-[clamp(26px,1.6vw,38px)] shadow-[0_18px_42px_-28px_rgba(10,18,31,0.2)] transition duration-200 ease-out hover:-translate-y-1 hover:border-[#c7d6ea]">
                <div className="flex items-center justify-between gap-6">
                <span className="rounded-full bg-[#eef5ff] px-4 py-2 text-[13px] font-semibold text-[#0e4beb]">{st(item.tag)}</span>
                  <time className="text-[13px] font-medium text-[#8b98ad]">{announcementDate(item)}</time>
                </div>
                <h2 className="mt-5 text-[clamp(20px,1.14vw,25px)] font-bold leading-tight text-[#0e131e]">{st(item.title)}</h2>
                <p className="mt-3 max-w-[900px] text-[clamp(14px,0.78vw,17px)] leading-7 text-[#5c697d]">{st(item.content)}</p>
              </article>
            ))}
          </section>
        </div>
      </div>
    </>
  )
}
