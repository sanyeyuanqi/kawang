import { useState, useCallback, useEffect, useRef } from "react"
import { cn, resolveAssetUrl } from "@/lib/utils"

interface Props {
  value?: string
  onChange?: (f: File) => void
  onRemove?: () => void
  accept?: string
  maxSizeMB?: number
  className?: string
  previewClassName?: string
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  accept = "image/jpeg,image/png,image/webp,image/gif",
  maxSizeMB = 5,
  className,
  previewClassName,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const maxBytes = maxSizeMB * 1024 * 1024
  useEffect(() => {
    setImageFailed(false)
  }, [preview, value])
  const handleFile = useCallback((file: File) => { setError(null); setImageFailed(false); const allowed = accept.split(",").map(t => t.trim()); if (!allowed.includes(file.type)) { setError("仅支持 JPG/PNG/WebP/GIF 图片"); return }; if (file.size > maxBytes) { setError(`图片大小不能超过 ${maxSizeMB}MB`); return }; setPreview(URL.createObjectURL(file)); onChange?.(file) }, [accept, maxBytes, maxSizeMB, onChange])
  const displayUrl = preview || resolveAssetUrl(value) || null
  return (
    <div className={cn("space-y-2", className)}>
      <div
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => { e.preventDefault(); setIsDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file) }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors",
          previewClassName || "aspect-video",
          isDragOver ? "border-primary-500 bg-primary-50" : "border-gray-300 bg-white hover:border-gray-400"
        )}
      >
        {displayUrl && !imageFailed ? (
          <div className="group relative h-full w-full">
            <img src={displayUrl} alt="preview" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" onClick={e => { e.stopPropagation(); setPreview(null); onRemove?.() }} className="rounded-lg bg-danger-500 px-3 py-1.5 text-13 text-white">删除</button>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-gray-400">
            <svg className="mx-auto mb-2 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-14"><span className="text-primary-500">点击上传</span> 或拖拽图片</p>
            <p className="mt-1 text-12">建议 16:9，支持 JPG/PNG/WebP/GIF，最大 {maxSizeMB}MB</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = "" }} className="hidden" />
      {error && <p className="text-12 text-danger-500">{error}</p>}
    </div>
  )
}
