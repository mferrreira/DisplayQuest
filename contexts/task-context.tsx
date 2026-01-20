"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { Task } from "@/contexts/types"
import { TasksAPI } from "@/contexts/api-client"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"

interface TaskContextType {
  tasks: Task[]
  loading: boolean
  error: string | null
  fetchTasks: (projectId?: number | null) => Promise<void>
  createTask: (task: any) => Promise<Task>
  updateTask: (id: number, task: Partial<Task>) => Promise<Task>
  completeTask: (id: number, userId?: number) => Promise<Task>
  approveTask: (id: number) => Promise<Task>
  rejectTask: (id: number, reason?: string) => Promise<Task>
  deleteTask: (id: number) => Promise<void>
}

const TaskContext = createContext<TaskContextType | undefined>(undefined)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const { fetchUsers } = useUser()

  const fetchTasks = useCallback(async (projectId?: number | null) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (user) {
        params.append('userId', user.id.toString())
        params.append('roles', user.roles?.join(',') || '')
      }
      if (projectId !== undefined && projectId !== null) {
        params.append('projectId', projectId.toString())
      }
      
      const queryString = params.toString()
      const finalParams = queryString ? `?${queryString}` : ""
      
      const response = await TasksAPI.getAll(finalParams)
      const tasks = response?.tasks || []
      
      setTasks(tasks)
    } catch (err) {
      console.error("Task context - Error fetching tasks:", err)
      setError("Erro ao carregar tarefas")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      fetchTasks()
    } else {
      setTasks([])
    }
  }, [user, fetchTasks])

  const createTask = async (taskData: any) => {
    try {
      setLoading(true)
      setError(null)

      const response = await TasksAPI.create(taskData)
      const task = response?.task
      if (task) {
        setTasks((prevTasks) => [...prevTasks, task])
        return task
      }
      throw new Error("Erro ao criar tarefa: resposta inválida")
    } catch (err) {
      setError("Erro ao criar tarefa")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateTask = async (id: number, taskData: Partial<Task>, userId?: number) => {
    try {
      setLoading(true)
      setError(null)
      const response = await TasksAPI.update(id, { ...taskData, userId })
      const task = response?.task
      if (task) {
        setTasks((prevTasks) => prevTasks.map((t) => (t.id === id ? task : t)))
        
        // Invalidate related cache
        
        return task
      }
      throw new Error("Erro ao atualizar tarefa: resposta inválida")
    } catch (err) {
      setError("Erro ao atualizar tarefa")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const completeTask = async (id: number, userId?: number) => {
    try {
      setLoading(true)
      setError(null)
      // Use current user's ID if no userId provided
      const targetUserId = userId || user?.id
      const response = await TasksAPI.complete(id, targetUserId)
      const task = response?.task
      if (task) {
        setTasks((prevTasks) => prevTasks.map((t) => (t.id === id ? task : t)))
        
        // Invalidate related cache
        
        await fetchUsers(); // Refresh users after completing a task
        return task
      }
      throw new Error("Erro ao completar tarefa: resposta inválida")
    } catch (err) {
      setError("Erro ao completar tarefa")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const approveTask = async (id: number) => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/tasks/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao aprovar tarefa')
      }
      
      const data = await response.json()
      const task = data.task
      
      if (task) {
        setTasks((prevTasks) => prevTasks.map((t) => (t.id === id ? task : t)))
        await fetchUsers(); // Refresh users after approving a task
        return task
      }
      throw new Error("Erro ao aprovar tarefa: resposta inválida")
    } catch (err) {
      setError("Erro ao aprovar tarefa")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const rejectTask = async (id: number, reason?: string) => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/tasks/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao rejeitar tarefa')
      }
      
      const data = await response.json()
      const task = data.task
      
      if (task) {
        setTasks((prevTasks) => prevTasks.map((t) => (t.id === id ? task : t)))
        return task
      }
      throw new Error("Erro ao rejeitar tarefa: resposta inválida")
    } catch (err) {
      setError("Erro ao rejeitar tarefa")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteTask = async (id: number) => {
    try {
      setLoading(true)
      setError(null)

      await TasksAPI.delete(id)
      setTasks((prevTasks) => prevTasks.filter((t) => t.id !== id))
      
    } catch (err) {
      setError("Erro ao excluir tarefa")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <TaskContext.Provider
      value={{
        tasks,
        loading,
        error,
        fetchTasks,
        createTask,
        updateTask,
        completeTask,
        approveTask,
        rejectTask,
        deleteTask,
      }}
    >
      {children}
    </TaskContext.Provider>
  )
}

export function useTask() {
  const context = useContext(TaskContext)
  if (context === undefined) {
    throw new Error("useTask deve ser usado dentro de um TaskProvider")
  }
  return context
}
