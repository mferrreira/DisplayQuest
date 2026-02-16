"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { User } from "@/contexts/types"
import { UsersAPI } from "@/contexts/api-client"
import { useAuth } from "@/contexts/auth-context"

interface UserContextType {
  users: User[]
  loading: boolean
  error: string | null
  fetchUsers: () => Promise<void>
  updateUser: (id: number, userData: Partial<User>) => Promise<User>
  addPointsToUser: (id: number, points: number) => Promise<User>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchUsers = useCallback(async () => {
    if (!user) {
      setUsers([])
      setLoading(false)
      return
    }

    // Verificar se o usuário tem permissão para ver outros usuários
    const canViewUsers = user.roles?.includes('COORDENADOR') || 
                        user.roles?.includes('GERENTE') || 
                        user.roles?.includes('GERENTE_PROJETO') ||
                        user.roles?.includes('PESQUISADOR') ||
                        user.roles?.includes('VOLUNTARIO') || 
                        user.roles?.includes('COLABORADOR') || 
                        user.roles?.includes('LABORATORISTA')

    if (!canViewUsers) {
      setUsers([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { users } = await UsersAPI.getAll()
      
      setUsers(users)
    } catch (err) {
      setError("Erro ao carregar usuários")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const updateUser = async (id: number, userData: Partial<User>) => {
    try {
      setLoading(true)
      setError(null)

      const { user } = await UsersAPI.update(id, userData)
      setUsers((prevUsers) => prevUsers.map((u) => (u.id === id ? user : u)))
      
      return user
    } catch (err) {
      setError("Erro ao atualizar usuário")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const addPointsToUser = async (id: number, points: number) => {
    try {
      setLoading(true)
      setError(null)

      const { user } = await UsersAPI.addPoints(id, points)
      setUsers((prevUsers) => prevUsers.map((u) => (u.id === id ? user : u)))
      
      return user
    } catch (err) {
      setError("Erro ao adicionar pontos")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <UserContext.Provider
      value={{
        users,
        loading,
        error,
        fetchUsers,
        updateUser,
        addPointsToUser,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser deve ser usado dentro de um UserProvider")
  }
  return context
}
