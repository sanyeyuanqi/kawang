import { useState, useCallback, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"

interface Props { placeholder?: string; onSearch?: (q: string) => void; debounceMs?: number; className?: string }
export function SearchBar({ placeholder, onSearch, debounceMs = 300, className }: Props) {
  const { st } = useLanguage()
  const [value, setValue] = useState("")
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value; setValue(v); if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => onSearch?.(v.trim()), debounceMs) }, [onSearch, debounceMs])
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])
  return <div className={cn("relative", className)}><svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><input type="text" value={value} onChange={handleChange} placeholder={placeholder || st("搜索...")} className={cn("w-full pl-10 pr-8 py-2 text-14 bg-gray-100 border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors")}/>{value && <button onClick={() => { setValue(""); onSearch?.("") }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>}</div>
}
