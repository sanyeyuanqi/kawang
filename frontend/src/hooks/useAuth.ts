import { useContext } from "react"
import { AuthContext } from "@/context/AuthContext"

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be within AuthProvider")
  return { ...ctx, isAuthenticated: !!ctx.user && !!ctx.token }
}
