"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { Project, ProjectFormData } from "@/contexts/types"
import { ProjectsAPI } from "@/contexts/api-client"
import { useAuth } from "@/contexts/auth-context"

interface ProjectContextType {
  projects: Project[]
  loading: boolean
  error: string | null
  fetchProjects: () => Promise<void>
  createProject: (project: ProjectFormData) => Promise<Project>
  updateProject: (id: number, project: Partial<Project>) => Promise<Project>
  deleteProject: (id: number) => Promise<void>
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const userId = user?.id

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { projects } = await ProjectsAPI.getAll()
      setProjects(projects)
    } catch (err) {
      setError("Erro ao carregar projetos")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (userId) {
      fetchProjects()
    } else {
      setProjects([])
    }
  }, [userId, fetchProjects])

  const createProject = async (projectData: ProjectFormData) => {
    try {
      if (!user) throw new Error("Usuário não autenticado")

      setLoading(true)
      setError(null)

      const { project } = await ProjectsAPI.create({
        ...projectData,
        createdBy: user.name,
      })

      setProjects((prevProjects) => [...prevProjects, project])
      return project
    } catch (err) {
      setError("Erro ao criar projeto")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateProject = async (id: number, projectData: Partial<Project>) => {
    try {
      setLoading(true)
      setError(null)

      const { project } = await ProjectsAPI.update(id, projectData)
      setProjects((prevProjects) => prevProjects.map((p) => (p.id === id ? project : p)))
      return project
    } catch (err) {
      setError("Erro ao atualizar projeto")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteProject = async (id: number) => {
    try {
      setLoading(true)
      setError(null)

      await ProjectsAPI.delete(id)
      setProjects((prevProjects) => prevProjects.filter((p) => p.id !== id))
    } catch (err) {
      setError("Erro ao excluir projeto")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProjectContext.Provider
      value={{
        projects,
        loading,
        error,
        fetchProjects,
        createProject,
        updateProject,
        deleteProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error("useProject deve ser usado dentro de um ProjectProvider")
  }
  return context
}
