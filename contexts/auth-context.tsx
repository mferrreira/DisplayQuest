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
  logout: () => void
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

  const logout = () => {
    signOut({ callbackUrl: "/login" })
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
