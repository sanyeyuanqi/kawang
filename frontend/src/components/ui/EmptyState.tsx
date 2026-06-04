import { cn } from "@/lib/utils"
import { Button } from "./Button"
interface Props { icon?: string; title: string; description?: string; action?: { label: string; onClick: () => void }; className?: string }
export function EmptyState({ icon = "📦", title, description, action, className }: Props) {
  return <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}><div className="text-48 mb-4 opacity-30">{icon}</div><h3 className="text-16 font-medium text-gray-700">{title}</h3>{description && <p className="mt-1 text-14 text-gray-500 max-w-sm">{description}</p>}{action && <Button className="mt-4" size="sm" onClick={action.onClick}>{action.label}</Button>}</div>
}
