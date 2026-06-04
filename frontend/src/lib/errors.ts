function normalizeRawErrorMessage(message: string) {
  const lower = message.toLowerCase()
  if (
    lower.includes("recipient may contain a non-existent account") ||
    (lower.includes("recipient") && lower.includes("non-existent")) ||
    lower.includes("(550")
  ) {
    return "邮箱不存在或无法接收验证码，请检查邮箱地址"
  }
  if (lower.includes("wrong_version_number") || lower.includes("smtp") || lower.includes("ssl")) {
    return "邮件服务连接失败，请联系管理员检查邮箱配置"
  }
  return message
}

export function getApiErrorMessage(error: any, fallback: string) {
  const data = error?.response?.data
  const detail = data?.detail

  if (typeof detail === "string") return normalizeRawErrorMessage(detail)
  if (detail?.msg) return normalizeRawErrorMessage(detail.msg)
  if (detail?.message) return normalizeRawErrorMessage(detail.message)
  if (data?.msg) return normalizeRawErrorMessage(data.msg)
  if (data?.message) return normalizeRawErrorMessage(data.message)
  return fallback
}
