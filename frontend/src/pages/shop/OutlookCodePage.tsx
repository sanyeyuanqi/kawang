import { useMemo, useState } from "react"
import api from "@/api/client"

interface OutlookCodeResult {
  email: string
  code: string
  from: string
  subject: string
  received_at: string
  body_preview: string
  body_text?: string
  refresh_token?: string
}

const providers = [
  {
    id: "outlook",
    name: "Outlook 邮箱",
    label: "Microsoft Graph",
    available: true,
  },
  {
    id: "reserved",
    name: "其他邮箱",
    label: "待接入",
    available: false,
  },
]

const BODY_PREVIEW_LIMIT = 1600

function parseEmail(raw: string) {
  return raw.trim().split("----")[0]?.trim() || ""
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@")
  if (!name || !domain) return email || "未识别邮箱"
  const visible = name.length <= 3 ? name.slice(0, 1) : name.slice(0, 3)
  return `${visible}***@${domain}`
}

function getErrorMessage(err: any, fallback: string) {
  const detail = err.response?.data?.detail
  if (typeof detail === "string") return detail
  return detail?.msg || err.response?.data?.msg || fallback
}

export default function OutlookCodePage() {
  const [selectedProvider, setSelectedProvider] = useState("outlook")
  const [combo, setCombo] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [result, setResult] = useState<OutlookCodeResult | null>(null)

  const parsedEmail = useMemo(() => parseEmail(combo), [combo])
  const bodyText = result?.body_text || result?.body_preview || ""
  const bodyTextSingleLine = bodyText.replace(/\s+/g, " ").trim()
  const bodyTextPreview = bodyTextSingleLine.length > BODY_PREVIEW_LIMIT
    ? `${bodyTextSingleLine.slice(0, BODY_PREVIEW_LIMIT)}...`
    : bodyTextSingleLine

  const fetchCode = async () => {
    setError("")
    setStatus("")
    setResult(null)

    if (selectedProvider !== "outlook") {
      setError("当前只支持 Outlook 邮箱")
      return
    }
    if (!combo.trim()) {
      setError("请先粘贴邮箱账号字符串")
      return
    }

    setLoading(true)
    try {
      const response = await api.post<{ code: number; msg: string; data: OutlookCodeResult }>("/outlook-code/fetch", {
        combo: combo.trim(),
      })
      setResult(response.data.data)
      setStatus("已读取最新验证码")
      await navigator.clipboard.writeText(response.data.data.code).catch(() => {})
    } catch (err: any) {
      setError(getErrorMessage(err, "读取失败，请检查账号信息或稍后重试"))
    } finally {
      setLoading(false)
    }
  }

  const copyText = async (text: string, message: string) => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setStatus(message)
  }

  return (
    <div className="min-h-[calc(100dvh-clamp(54px,3.38vw,96px))] bg-[#f4f7fb] pb-28 pt-4 md:pb-16 md:pt-5">
      <div className="figma-web-container grid items-start gap-5 px-4 md:px-0 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-full rounded-[8px] border border-[#dfe5ed] bg-white p-4 shadow-[0_16px_36px_-24px_rgba(10,18,31,0.24)] md:p-5">
          <div className="border-b border-[#edf1f6] pb-4">
            <p className="text-[13px] font-semibold text-[#6b7990]">获取邮箱类型</p>
            <h1 className="mt-2 text-[22px] font-bold text-[#111827]">验证码读取</h1>
          </div>

          <div className="mt-4 space-y-2">
            {providers.map((provider) => {
              const active = selectedProvider === provider.id
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => provider.available && setSelectedProvider(provider.id)}
                  disabled={!provider.available}
                  className={
                    "flex h-[68px] w-full items-center justify-between rounded-[8px] border px-4 text-left transition " +
                    (active
                      ? "border-[#2562eb] bg-[#eef3ff] text-[#0e4beb]"
                      : "border-[#dfe5ed] bg-white text-[#293344] hover:border-[#b8c9e2] hover:bg-[#f8fbff]") +
                    (!provider.available ? " cursor-not-allowed opacity-50" : "")
                  }
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold">{provider.name}</span>
                    <span className="mt-1 block text-[12px] font-semibold text-[#8e99aa]">{provider.label}</span>
                  </span>
                  <span className={"h-3 w-3 rounded-full " + (active ? "bg-[#2562eb]" : "bg-[#d6deea]")} />
                </button>
              )
            })}
          </div>

          <div className="mt-5 rounded-[8px] border border-[#edf1f6] bg-[#f8fbff] p-4">
            <p className="text-[12px] font-semibold text-[#8e99aa]">当前账号</p>
            <p className="mt-2 break-all text-[14px] font-bold text-[#293344]">{maskEmail(parsedEmail)}</p>
          </div>
        </aside>

        <main className="grid gap-5">
          <section className="rounded-[8px] border border-[#dfe5ed] bg-white p-5 shadow-[0_16px_36px_-24px_rgba(10,18,31,0.24)] md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#6b7990]">账号输入</p>
                <h2 className="mt-1 text-[20px] font-bold text-[#111827]">粘贴邮箱信息</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCombo("")
                  setError("")
                  setStatus("")
                  setResult(null)
                }}
                className="h-9 rounded-[8px] border border-[#dfe5ed] bg-white px-4 text-[13px] font-semibold text-[#5d6675]"
              >
                清空
              </button>
            </div>

            <label className="mt-5 block text-[13px] font-semibold text-[#404a5c]">
              邮箱----密码----client_id----refresh_token
            </label>
            <textarea
              value={combo}
              onChange={(event) => setCombo(event.target.value)}
              spellCheck={false}
              placeholder="example@outlook.com----password----client_id----refresh_token"
              className="mt-2 min-h-[180px] w-full resize-y rounded-[8px] border border-[#dfe5ed] bg-[#fafbfd] px-4 py-3 font-mono text-[13px] leading-6 text-[#111827] outline-none placeholder:text-[#a1acbb] focus:border-[#2562eb]"
            />

            <button
              type="button"
              onClick={fetchCode}
              disabled={loading}
              className="mt-4 h-[48px] w-full rounded-[8px] bg-[#2562eb] text-[16px] font-bold text-white disabled:opacity-60"
            >
              {loading ? "正在获取..." : "获取邮箱验证码"}
            </button>

            <p className={"mt-3 min-h-[20px] text-[13px] font-semibold " + (error ? "text-[#e82828]" : "text-[#07a577]")}>
              {error || status}
            </p>
          </section>

          <section className="rounded-[8px] border border-[#dfe5ed] bg-white p-5 shadow-[0_16px_36px_-24px_rgba(10,18,31,0.24)] md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f6] pb-4">
              <div>
                <p className="text-[13px] font-semibold text-[#6b7990]">输出结果</p>
                <h2 className="mt-1 text-[20px] font-bold text-[#111827]">验证码与正文</h2>
              </div>
              <button
                type="button"
                onClick={() => copyText(result?.code || "", "验证码已复制")}
                disabled={!result?.code}
                className="h-9 rounded-[8px] border border-[#dfe5ed] bg-white px-4 text-[13px] font-semibold text-[#2562eb] disabled:text-[#a1acbb]"
              >
                复制验证码
              </button>
            </div>

            <div className="mt-5 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface-soft)] p-5">
              <p className="text-[13px] font-semibold text-[var(--app-muted)]">验证码</p>
              <p className="mt-3 min-h-[56px] break-all font-mono text-[42px] font-bold leading-none text-[var(--app-text)]">
                {result?.code || "--"}
              </p>
            </div>

            <div className="mt-4 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-[var(--app-muted)]">邮件正文</p>
                <button
                  type="button"
                  onClick={() => copyText(bodyTextSingleLine, "正文已复制")}
                  disabled={!bodyTextSingleLine}
                  className="h-8 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-3 text-[12px] font-bold text-[#2562eb] disabled:text-[#a1acbb]"
                >
                  复制正文
                </button>
              </div>
              <p
                className="mt-4 max-h-[220px] min-h-[48px] overflow-y-auto whitespace-normal break-all rounded-[8px] bg-[var(--app-surface-soft)] px-4 py-3 text-[14px] font-semibold leading-6 text-[var(--app-text)]"
              >
                {bodyTextPreview || "获取成功后会直接显示邮件正文预览。"}
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
