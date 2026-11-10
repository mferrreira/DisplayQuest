"use client"

import type { ReactNode } from "react"
import type { User } from "@/contexts/types"
import { useSession, signIn, signOut } from "next-auth/react"

interface AuthContextType {
  user: User | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function useAuth(): AuthContextType {
  const { data: session, status } = useSession()
  const user = session?.user as User | null
  const loading = status === "loading"
  const error = null

  const login = async (email: string, password: string) => {
    const result = await signIn("credentials", { redirect: false, email, password })
    if (result?.error) throw new Error(result.error)
  }

  const logout = async () => {
    // S03 (R3, ADR-001): nem `callbackUrl` absoluta nem `pages.signOut` mantêm o host do acesso
    // — o NextAuth resolve os dois contra NEXTAUTH_URL (medido em 127.0.0.1:3001). O landing é
    // feito pelo cliente, com caminho relativo, que é o host da requisição.
    // A falha do signOut não pode virar rejection não tratada no onClick dos dois consumidores
    // (licão medida do gate: rejection não tratada derruba o Vitest com exit 1). O logout é
    // terminal: mesmo na falha, o landing é o /login do host em uso.
    Promise.resolve(signOut({ redirect: false })).catch(() => {})
    window.location.href = "/login"
  }

  const register = async (name: string, email: string, password: string) => {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Erro ao criar conta")
    }

    return data
  }

  return { user, loading, error, login, register, logout }
}
