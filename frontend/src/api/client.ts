import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
})

let isRefreshing = false
let refreshWaiters: Array<(token: string | null) => void> = []
const AUTH_STORAGE_KEY = "auth_storage"
const USER_STORAGE_KEY = "auth_user"
type AuthStorageKind = "local" | "session"

function notifyRefreshWaiters(token: string | null) {
  refreshWaiters.forEach((resolve) => resolve(token))
  refreshWaiters = []
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token && config.headers) {
    config.headers.Authorization = "Bearer " + token
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    if (err.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const refreshToken = getRefreshToken()

      if (refreshToken) {
        originalRequest._retry = true

        if (isRefreshing) {
          const token = await new Promise<string | null>((resolve) => {
            refreshWaiters.push(resolve)
          })

          if (token) {
            originalRequest.headers.Authorization = "Bearer " + token
            return api(originalRequest)
          }
        } else {
          isRefreshing = true
          try {
            const res = await axios.post(
              (import.meta.env.VITE_API_BASE_URL || "/api/v1") + "/auth/refresh",
              { refresh_token: refreshToken },
              { headers: { "Content-Type": "application/json" } }
            )
            const nextToken = res.data?.data?.access_token
            if (nextToken) {
              setToken(nextToken)
              notifyRefreshWaiters(nextToken)
              originalRequest.headers.Authorization = "Bearer " + nextToken
              return api(originalRequest)
            }
          } catch {
            notifyRefreshWaiters(null)
          } finally {
            isRefreshing = false
          }
        }
      }
    }

    if (err.response?.status === 401) {
      clearToken()
      if (window.location.pathname !== "/login") {
        window.location.href = "/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search)
      }
    }
    return Promise.reject(err)
  }
)

export default api

function getStorage(kind: AuthStorageKind): Storage {
  return kind === "local" ? localStorage : sessionStorage
}

function getActiveStorageKind(): AuthStorageKind {
  if (localStorage.getItem("token")) return "local"
  if (sessionStorage.getItem("token")) return "session"
  return localStorage.getItem(AUTH_STORAGE_KEY) === "session" ? "session" : "local"
}

function clearStorage(storage: Storage) {
  storage.removeItem("token")
  storage.removeItem("refresh_token")
  storage.removeItem(USER_STORAGE_KEY)
  storage.removeItem("admin_token")
  storage.removeItem("admin_refresh_token")
}

export function setToken(token: string, remember?: boolean, refreshToken?: string) {
  const kind: AuthStorageKind = remember === undefined ? getActiveStorageKind() : (remember ? "local" : "session")
  const storage = getStorage(kind)
  const staleStorage = getStorage(kind === "local" ? "session" : "local")

  clearStorage(staleStorage)
  storage.setItem("token", token)
  if (refreshToken) storage.setItem("refresh_token", refreshToken)
  localStorage.setItem(AUTH_STORAGE_KEY, kind)
  localStorage.removeItem("admin_token")
  localStorage.removeItem("admin_refresh_token")
  sessionStorage.removeItem("admin_token")
  sessionStorage.removeItem("admin_refresh_token")
}
export function setStoredUser(user: unknown, remember?: boolean) {
  const kind: AuthStorageKind = remember === undefined ? getActiveStorageKind() : (remember ? "local" : "session")
  const storage = getStorage(kind)
  const staleStorage = getStorage(kind === "local" ? "session" : "local")

  staleStorage.removeItem(USER_STORAGE_KEY)
  storage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}
export function getStoredUser<T = unknown>(): T | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY) || sessionStorage.getItem(USER_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY)
    sessionStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}
export function clearToken() {
  clearStorage(localStorage)
  clearStorage(sessionStorage)
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
export function getToken(): string | null {
  return localStorage.getItem("token") || sessionStorage.getItem("token")
}
export function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token") || sessionStorage.getItem("refresh_token")
}
