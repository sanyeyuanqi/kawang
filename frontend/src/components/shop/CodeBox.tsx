import { useState } from "react"
import { useLanguage } from "@/context/LanguageContext"
interface Props { codes: string[] }
export function CodeBox({ codes }: Props) {
  const { st } = useLanguage()
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const copy = async (code: string, i: number) => {
    try { await navigator.clipboard.writeText(code); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 2000) } catch { setCopiedIdx(null) }
  }
  return (
    <div className="bg-gray-100 rounded-2xl p-4 space-y-3">
      {codes.map((code, i) => (
        <div key={i} className="flex items-center justify-between">
          <span className="text-17 font-bold font-mono tracking-wide">{code}</span>
          <button onClick={() => copy(code, i)} className="text-primary-500 text-13 font-medium hover:underline shrink-0 ml-4">{copiedIdx === i ? st("已复制") : st("复制")}</button>
        </div>
      ))}
      {codes.length === 0 && <p className="text-14 text-gray-400 text-center">{st("暂无卡密")}</p>}
    </div>
  )
}
