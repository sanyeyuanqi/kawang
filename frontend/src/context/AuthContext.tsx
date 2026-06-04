import { createContext, useState, useEffect, useCallback } from "react"
import type { ReactNode } from "react"
import api, { setToken, clearToken, getToken, getRefreshToken } from "@/api/client"

interface User {
  id: number
  username: string
  phone?: string | null
  email: string
  role: "buyer" | "admin"
  is_active?: boolean
  created_at?: string | null
  updated_at?: string | null
}

interface AuthState { user: User | null; token: string | null; refreshTokenValue: string | null; isLoading: boolean }

interface AuthCtx extends AuthState {
  login(account: string, password: string, remember?: boolean): Promise<User>
  register(data: Record<string, unknown>): Promise<void>
  refreshToken(): Promise<string | null>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthCtx | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: getToken(),
    refreshTokenValue: getRefreshToken(),
    isLoading: true
  })

  useEffect(() => {
    const t = getToken()
    if (!t) { setState(p => ({ ...p, isLoading: false })); return }
    api.get("/users/me").then(r => {
      setState({ user: r.data.data as User, token: getToken(), refreshTokenValue: getRefreshToken(), isLoading: false })
    }).catch(() => {
      clearToken()
      setState({ user: null, token: null, refreshTokenValue: null, isLoading: false })
    })
  }, [])

  const login = useCallback(async (account: string, password: string, remember = false) => {
    const r = await api.post("/auth/login", { account, password })
    const d = r.data.data
    setToken(d.access_token, remember, d.refresh_token)
    setState({ user: d.user, token: d.access_token, refreshTokenValue: d.refresh_token, isLoading: false })
    return d.user as User
  }, [])

  const register = useCallback(async (data: Record<string, unknown>) => {
    const r = await api.post("/auth/register", data)
    const d = r.data.data
    setToken(d.access_token, true, d.refresh_token)
    setState({ user: d.user, token: d.access_token, refreshTokenValue: d.refresh_token, isLoading: false })
  }, [])

  const refreshToken = useCallback(async () => {
    const storedRefreshToken = getRefreshToken()
    if (!storedRefreshToken) return null

    try {
      const r = await api.post("/auth/refresh", { refresh_token: storedRefreshToken })
      const accessToken = r.data?.data?.access_token
      if (!accessToken) return null
      setToken(accessToken)
      setState((prev) => ({ ...prev, token: accessToken, refreshTokenValue: storedRefreshToken, isLoading: false }))
      return accessToken
    } catch {
      clearToken()
      setState({ user: null, token: null, refreshTokenValue: null, isLoading: false })
      return null
    }
  }, [])

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout") } finally {
      clearToken()
      setState({ user: null, token: null, refreshTokenValue: null, isLoading: false })
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, register, refreshToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
