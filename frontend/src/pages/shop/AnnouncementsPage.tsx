import MobilePhoneFrame from "@/components/shop/MobilePhoneFrame"
import { useLanguage } from "@/context/LanguageContext"

const announcements = [
  {
    title: "自动发卡服务正常运行",
    date: "2026-06-04",
    tag: "服务状态",
    content: "店铺已开启自动发卡，付款完成后系统会自动发放卡密。请保存下单时填写的联系方式，方便后续查询订单。",
  },
  {
    title: "订单查询方式说明",
    date: "2026-06-04",
    tag: "订单查询",
    content: "无需登录也可以查询订单。进入订单查询页面后，输入订单号、手机号、邮箱、微信或 QQ 即可找回购买记录和卡密。",
  },
  {
    title: "售后处理提醒",
    date: "2026-06-04",
    tag: "售后说明",
    content: "如遇卡密无法使用、未收到卡密或支付状态异常，请保留下单信息并联系客服处理。",
  },
]

export default function AnnouncementsPage() {
  const { st } = useLanguage()

  return (
    <>
      <MobilePhoneFrame className="bg-[#f6f8fb]" contentClassName="px-7 pt-5 pb-32" showHomeIndicator={false}>
        <section>
          <h1 className="text-[30px] font-bold leading-none text-[#0e131e]">{st("公告")}</h1>
          <p className="mt-3 text-[16px] leading-6 text-[#6b7990]">{st("查看店铺服务状态、订单查询和售后提醒。")}</p>
        </section>

        <section className="mt-8 space-y-5">
          {announcements.map((item) => (
            <article key={item.title} className="rounded-[20px] border border-[#dbe5f5] bg-white px-6 py-6 shadow-[0_12px_28px_-14px_rgba(10,18,31,0.14)]">
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full bg-[#e8f2ff] px-3 py-1 text-[12px] font-semibold text-[#0e4beb]">{st(item.tag)}</span>
                <time className="text-[12px] font-medium text-[#8b98ad]">{item.date}</time>
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
            {announcements.map((item) => (
              <article key={item.title} className="rounded-[22px] border border-[#dfe5ed] bg-white px-[clamp(30px,1.9vw,44px)] py-[clamp(26px,1.6vw,38px)] shadow-[0_18px_42px_-28px_rgba(10,18,31,0.2)] transition duration-200 ease-out hover:-translate-y-1 hover:border-[#c7d6ea]">
                <div className="flex items-center justify-between gap-6">
                <span className="rounded-full bg-[#eef5ff] px-4 py-2 text-[13px] font-semibold text-[#0e4beb]">{st(item.tag)}</span>
                  <time className="text-[13px] font-medium text-[#8b98ad]">{item.date}</time>
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
