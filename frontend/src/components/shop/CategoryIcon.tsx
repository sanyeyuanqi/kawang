import type { Category } from "@/types/common"

interface CategoryIconProps {
  category: Pick<Category, "name" | "subtitle">
  theme: [string, string]
  active?: boolean
  onClick?: () => void
}

export default function CategoryIcon({ category, theme, active = false, onClick }: CategoryIconProps) {
  const [bg, color] = theme

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group flex h-[78px] flex-col items-center justify-center rounded-[18px] border p-0 text-left transition duration-200 ease-out md:h-[clamp(72px,4.51vw,128px)] md:items-start md:rounded-[clamp(14px,0.85vw,24px)] md:p-[clamp(14px,0.91vw,26px)] md:hover:-translate-y-1 md:hover:shadow-[0_18px_34px_-18px_rgba(10,18,31,0.38)] md:active:translate-y-0 " +
        (active ? "border-[#0e4beb] ring-2 ring-[#0e4beb]/15" : "border-[#dfe5ed] md:border-transparent md:hover:border-[#b8c9e2]")
      }
      style={{ backgroundColor: bg }}
      aria-pressed={active}
    >
      <h3 className="text-center text-[15px] font-bold leading-[18px] transition md:text-left md:text-[clamp(13px,0.78vw,22px)] md:group-hover:translate-x-0.5" style={{ color }}>{category.name}</h3>
      <p className="mt-1 text-center text-[13px] font-semibold text-[#0e131e] transition md:mt-[clamp(4px,0.28vw,8px)] md:text-left md:text-[clamp(10px,0.56vw,16px)] md:font-normal md:text-[#6b7990] md:group-hover:text-[#404a5c]">{category.subtitle}</p>
    </button>
  )
}
