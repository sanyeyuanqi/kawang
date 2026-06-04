import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"
import { Button } from "./Button"
interface Props { message?: string; onRetry?: () => void; className?: string }
export function ErrorState({ message, onRetry, className }: Props) {
  const { st } = useLanguage()
  const displayMessage = message || st("加载失败，请稍后重试")
  return <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}><div className="w-16 h-16 mb-4 rounded-full bg-danger-50 flex items-center justify-center text-3xl">⚠</div><h3 className="text-16 font-medium text-gray-700">{st("出错了")}</h3><p className="mt-1 text-14 text-gray-500 max-w-sm">{displayMessage}</p>{onRetry && <Button className="mt-4" variant="danger" size="sm" onClick={onRetry}>{st("重新加载")}</Button>}</div>
}
