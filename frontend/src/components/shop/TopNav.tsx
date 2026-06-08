import { Link, useLocation } from "react-router-dom"
import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/context/LanguageContext"
import { useTheme } from "@/context/ThemeContext"
import { useAuth } from "@/hooks/useAuth"
import type { Language } from "@/context/LanguageContext"

interface TopNavProps {
  className?: string
  containerClassName?: string
}

export default function TopNav({ className = "", containerClassName = "figma-web-container" }: TopNavProps) {
  const location = useLocation()
  const { language, setLanguage, t } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const { user, isAuthenticated } = useAuth()
  const [languageOpen, setLanguageOpen] = useState(false)
  const languageMenuRef = useRef<HTMLDivElement | null>(null)
  const isActive = (path: string) => location.pathname === path
  const languageOptions: { value: Language; label: string }[] = [
    { value: "zh-CN", label: "简体" },
    { value: "zh-TW", label: "繁體" },
    { value: "en", label: "English" },
  ]
  const currentLanguageLabel = languageOptions.find(option => option.value === language)?.label ?? "简体"
  const userDisplayName = user?.username || user?.email || ""

  useEffect(() => {
    if (!languageOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageOpen(false)
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [languageOpen])

  return (
    <header className={"sticky top-0 z-40 hidden h-[clamp(54px,3.38vw,96px)] border-b border-[#dfe5ed] bg-white md:block " + className}>
      <div className={containerClassName + " flex h-full items-center"}>
        <Link
          to="/"
          className="w-[clamp(104px,5.6vw,160px)] text-[clamp(18px,0.99vw,28px)] font-bold leading-none text-[#111827] transition duration-200 ease-out hover:-translate-y-0.5 hover:text-[#0e4beb]"
        >
          {t("brand")}
        </Link>
        <nav className="ml-[clamp(24px,1.8vw,52px)] flex items-center gap-[clamp(20px,1.27vw,36px)] text-[clamp(12px,0.6vw,17px)] font-medium">
          <Link className={"top-nav-link group relative inline-flex h-8 items-center transition duration-200 ease-out hover:-translate-y-0.5 hover:text-[#0e4beb] " + (isActive("/") ? "top-nav-link-active text-[#0e4beb]" : "text-[#6b7990]")} to="/">
            <span>{t("nav.home")}</span>
            <span className={"top-nav-underline absolute bottom-0 left-0 h-[2px] rounded-full bg-[#0e4beb] transition-all duration-200 " + (isActive("/") ? "w-full" : "w-0 group-hover:w-full")} />
          </Link>
          <Link className={"top-nav-link group relative inline-flex h-8 items-center transition duration-200 ease-out hover:-translate-y-0.5 hover:text-[#0e4beb] " + (isActive("/announcements") ? "top-nav-link-active text-[#0e4beb]" : "text-[#6b7990]")} to="/announcements">
            <span>{t("nav.announcements")}</span>
            <span className={"top-nav-underline absolute bottom-0 left-0 h-[2px] rounded-full bg-[#0e4beb] transition-all duration-200 " + (isActive("/announcements") ? "w-full" : "w-0 group-hover:w-full")} />
          </Link>
          <Link className={"top-nav-link group relative inline-flex h-8 items-center transition duration-200 ease-out hover:-translate-y-0.5 hover:text-[#0e4beb] " + (isActive("/about") ? "top-nav-link-active text-[#0e4beb]" : "text-[#6b7990]")} to="/about">
            <span>{t("nav.about")}</span>
            <span className={"top-nav-underline absolute bottom-0 left-0 h-[2px] rounded-full bg-[#0e4beb] transition-all duration-200 " + (isActive("/about") ? "w-full" : "w-0 group-hover:w-full")} />
          </Link>
          <Link className={"top-nav-link group relative inline-flex h-8 items-center transition duration-200 ease-out hover:-translate-y-0.5 hover:text-[#0e4beb] " + (isActive("/outlook-code") ? "top-nav-link-active text-[#0e4beb]" : "text-[#6b7990]")} to="/outlook-code">
            <span>{t("nav.code")}</span>
            <span className={"top-nav-underline absolute bottom-0 left-0 h-[2px] rounded-full bg-[#0e4beb] transition-all duration-200 " + (isActive("/outlook-code") ? "w-full" : "w-0 group-hover:w-full")} />
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-[clamp(12px,0.85vw,24px)]">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-[clamp(22px,1.27vw,36px)] w-[clamp(44px,2.54vw,72px)] items-center rounded-full bg-[#edf4ff] p-[2px]"
            aria-label={theme === "dark" ? t("nav.light") : t("nav.dark")}
            title={t("nav.theme")}
          >
            <span className={"grid h-full aspect-square place-items-center rounded-full text-[clamp(10px,0.56vw,16px)] leading-none shadow-[0_4px_12px_-6px_rgba(10,18,31,0.45)] transition-all duration-200 " + (theme === "dark" ? "translate-x-[calc(clamp(44px,2.54vw,72px)-clamp(22px,1.27vw,36px))] bg-[#111827]" : "translate-x-0 bg-white text-[#f09e1f]")}>
              {theme === "dark" ? <span className="block h-[45%] w-[45%] rounded-full bg-[#f8fafc] shadow-[-3px_0_0_0_#111827]" /> : "☼"}
            </span>
          </button>
          <div ref={languageMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setLanguageOpen(open => !open)}
              className={"top-nav-button-glow flex h-[clamp(34px,1.9vw,54px)] min-w-[clamp(92px,5.25vw,136px)] items-center justify-center rounded-[clamp(10px,0.56vw,16px)] border bg-white px-[clamp(12px,0.78vw,22px)] text-[clamp(12px,0.56vw,16px)] font-semibold transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#b8c9e2] " + (languageOpen ? "border-[#b8c9e2] text-[#0e4beb] shadow-[0_12px_24px_-18px_rgba(10,18,31,0.28)]" : "border-[#dfe5ed] text-[#111827]")}
              aria-label={t("nav.translate")}
              aria-expanded={languageOpen}
            >
              <span className="flex h-full items-center gap-[clamp(8px,0.48vw,13px)]">
                <span className="leading-none">{currentLanguageLabel}</span>
                <span className={"top-nav-language-arrow h-[clamp(7px,0.42vw,11px)] w-[clamp(7px,0.42vw,11px)] border-b-[2px] border-r-[2px] transition duration-200 " + (languageOpen ? "translate-y-[2px] rotate-[225deg] border-[#0e4beb]" : "translate-y-[-2px] rotate-45 border-[#111827]")} />
              </span>
            </button>
            {languageOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[clamp(148px,8.25vw,190px)] overflow-hidden rounded-[16px] border border-[#dfe5ed] bg-white p-2 shadow-[0_22px_46px_-20px_rgba(10,18,31,0.38)]">
                {languageOptions.map(option => {
                  const active = option.value === language
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setLanguage(option.value)
                        setLanguageOpen(false)
                      }}
                      className={"mb-1 flex h-[38px] w-full items-center justify-between rounded-[10px] px-3.5 text-left text-[14px] font-semibold transition duration-150 last:mb-0 " + (active ? "bg-[#e8f2ff] text-[#0e4beb]" : "text-[#404a5c] hover:bg-[#f5f8fd] hover:text-[#0e4beb]")}
                    >
                      <span>{option.label}</span>
                      <span className={"h-2 w-2 rounded-full transition " + (active ? "bg-[#0e4beb]" : "bg-transparent")} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {!isAuthenticated && (
            <Link
              to="/orders/query"
              className="top-nav-button-glow flex h-[clamp(34px,1.9vw,54px)] w-[clamp(90px,5.28vw,150px)] items-center justify-center rounded-[clamp(8px,0.49vw,14px)] border border-[#dfe5ed] bg-white text-[clamp(12px,0.56vw,16px)] font-medium text-[#111827] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#b8c9e2] hover:text-[#0e4beb] active:translate-y-0"
            >
              {t("nav.orderQuery")}
            </Link>
          )}
          {isAuthenticated && user ? (
            <Link
              to="/profile"
              className="top-nav-button-glow flex h-[clamp(34px,1.9vw,54px)] w-[clamp(34px,1.9vw,54px)] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#d8e4f4] bg-[#e8f2ff] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#a9c2ef] active:translate-y-0"
              title={userDisplayName}
              aria-label={t("nav.profile")}
            >
                <img
                  src="/images/avatar_male_15.png"
                  alt={userDisplayName}
                  className="h-full w-full object-cover"
                />
            </Link>
          ) : (
            <Link
              to="/login"
              className="top-nav-button-glow flex h-[clamp(34px,1.9vw,54px)] w-[clamp(76px,4.44vw,126px)] items-center justify-center rounded-[clamp(8px,0.49vw,14px)] bg-[#e8f2ff] text-[clamp(12px,0.56vw,16px)] font-medium text-[#0e4beb] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#dbeafe] active:translate-y-0"
            >
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
