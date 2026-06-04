import { Modal } from "./Modal"
import { Button } from "./Button"
interface Props { open: boolean; onClose: () => void; onConfirm: () => void; title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean; loading?: boolean }
export function ConfirmDialog({ open, onClose, onConfirm, title = "确认操作", message, confirmText = "确定", cancelText = "取消", danger = false, loading = false }: Props) {
  return <Modal open={open} onClose={onClose} title={title} showClose={false}><div className="py-2"><p className="text-14 text-gray-600">{message}</p></div><div className="flex gap-3 mt-6"><Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>{cancelText}</Button><Button variant={danger ? "danger" : "primary"} className="flex-1" onClick={onConfirm} loading={loading}>{confirmText}</Button></div></Modal>
}
