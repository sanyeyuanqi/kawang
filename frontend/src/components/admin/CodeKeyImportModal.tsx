import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/Modal"

const CODE_VALUE_MAX_LENGTH = 1000

function parseCodeLines(value: string) {
  const lines = value
    .split(/\r\n|\n|\r/)
    .map((item) => item.trim())
    .filter(Boolean)
  const uniqueLines = Array.from(new Set(lines))

  return {
    lines,
    uniqueLines,
    duplicateCount: lines.length - uniqueLines.length,
  }
}

export interface CodeKeyProductOption {
  id: number
  name: string
}

interface Props {
  open: boolean
  products: CodeKeyProductOption[]
  defaultProductId?: number | null
  loading?: boolean
  onClose: () => void
  onSubmit: (payload: { product_id: number; codes: string }) => Promise<void>
}

export default function CodeKeyImportModal({ open, products, defaultProductId, loading = false, onClose, onSubmit }: Props) {
  const [productId, setProductId] = useState<number>(defaultProductId || 0)
  const [codes, setCodes] = useState("")

  useEffect(() => {
    if (open) {
      setProductId(defaultProductId || products[0]?.id || 0)
      setCodes("")
    }
  }, [defaultProductId, open, products])

  const parsedCodes = parseCodeLines(codes)
  const codeCount = parsedCodes.uniqueLines.length
  const overLength = parsedCodes.uniqueLines.some((item) => item.length > CODE_VALUE_MAX_LENGTH)

  const submit = async () => {
    if (!productId || codeCount === 0 || overLength) return
    await onSubmit({ product_id: productId, codes: parsedCodes.uniqueLines.join("\n") })
  }

  return (
    <Modal open={open} onClose={onClose} title="导入卡密" className="md:max-w-[560px]">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-14 font-medium text-[#293344]">选择商品</span>
          <select
            value={productId}
            onChange={(event) => setProductId(Number(event.target.value))}
            className="h-11 w-full rounded-[12px] border border-[#dfe6ef] bg-white px-3 text-14 outline-none focus:border-primary-500"
          >
            <option value={0}>{products.length ? "请选择商品" : "暂无可选商品"}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
          {!products.length && (
            <p className="mt-2 text-12 text-danger-500">暂无可选商品，请先新增商品。</p>
          )}
        </label>

        <label className="block">
          <span className="mb-2 block text-14 font-medium text-[#293344]">卡密内容</span>
          <textarea
            value={codes}
            onChange={(event) => setCodes(event.target.value)}
            placeholder={"每行一条卡密\nVIP-MONTH-XXXX-XXXX\nVIP-MONTH-YYYY-YYYY"}
            wrap="off"
            spellCheck={false}
            className="h-44 w-full resize-none overflow-auto whitespace-pre rounded-[14px] border border-[#dfe6ef] bg-[#fbfdff] p-3 font-mono text-14 outline-none focus:border-primary-500"
          />
        </label>

        <div className="rounded-[12px] bg-[#eef3ff] px-4 py-3 text-13 font-medium text-primary-600">
          当前将导入 {codeCount} 条卡密。每行仅识别一条，空行会被忽略
          {parsedCodes.duplicateCount > 0 ? `，已过滤 ${parsedCodes.duplicateCount} 条重复卡密` : ""}
          ，单条最长 {CODE_VALUE_MAX_LENGTH} 个字符。
        </div>
        {overLength && (
          <p className="rounded-[12px] bg-danger-50 px-4 py-3 text-13 font-semibold text-danger-500">
            单条卡密不能超过 {CODE_VALUE_MAX_LENGTH} 个字符
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={loading} className="h-11 flex-1 rounded-[12px] border border-[#dfe6ef] bg-white text-14 font-semibold text-[#4f5b70] disabled:opacity-60">
            取消
          </button>
          <button type="button" onClick={submit} disabled={loading || !productId || codeCount === 0 || overLength} className="h-11 flex-1 rounded-[12px] bg-primary-500 text-14 font-semibold text-white shadow-lg shadow-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "导入中..." : "确认导入"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
