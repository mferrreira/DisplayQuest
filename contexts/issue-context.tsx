"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { IssuesAPI } from './api-client'
import { Issue } from './types'

interface IssueContextType {
  issues: Issue[]
  loading: boolean
  error: string | null
  fetchIssues: (status?: string, priority?: string, assignedTo?: number) => Promise<void>
  fetchIssueById: (id: number) => Promise<Issue | null>
  createIssue: (issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Issue>
  updateIssue: (id: number, updates: Partial<Issue>) => Promise<Issue>
  deleteIssue: (id: number) => Promise<void>
  assignIssue: (id: number, assignedTo: number) => Promise<Issue>
  updateIssueStatus: (id: number, status: string) => Promise<Issue>
  resolveIssue: (id: number, resolution: string) => Promise<Issue>
  getUserIssues: (userId: number) => Issue[]
  getAssignedIssues: (userId: number) => Issue[]
  getOpenIssues: () => Issue[]
  getResolvedIssues: () => Issue[]
}

const IssueContext = createContext<IssueContextType | undefined>(undefined)

export function IssueProvider({ children }: { children: ReactNode }) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchIssues = useCallback(async (status?: string, priority?: string, assignedTo?: number) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (status) params.set("status", status)
      if (priority) params.set("priority", priority)
      if (typeof assignedTo === "number") params.set("assignedTo", String(assignedTo))

      const query = params.toString()
      const response = await IssuesAPI.getAll(query ? `?${query}` : "")
      setIssues(response.issues || [])
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar issues')
      console.error('Error fetching issues:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchIssueById = useCallback(async (id: number): Promise<Issue | null> => {
    try {
      setError(null)
      const response = await IssuesAPI.getById(id)
      return response.issue || null
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar issue')
      console.error('Error fetching issue:', err)
      return null
    }
  }, [])

  const createIssue = useCallback(async (issueData: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue> => {
    try {
      setError(null)
      const response = await IssuesAPI.create(issueData)
      const newIssue = response.issue
      setIssues(prev => [newIssue, ...prev])
      return newIssue
    } catch (err: any) {
      setError(err.message || 'Erro ao criar issue')
      console.error('Error creating issue:', err)
      throw err
    }
  }, [])

  const updateIssue = useCallback(async (id: number, updates: Partial<Issue>): Promise<Issue> => {
    try {
      setError(null)
      const response = await IssuesAPI.update(id, updates)
      const updatedIssue = response.issue
      setIssues(prev => prev.map(issue => 
        issue.id === id ? updatedIssue : issue
      ))
      return updatedIssue
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar issue')
      console.error('Error updating issue:', err)
      throw err
    }
  }, [])

  const deleteIssue = useCallback(async (id: number): Promise<void> => {
    try {
      setError(null)
      await IssuesAPI.delete(id)
      setIssues(prev => prev.filter(issue => issue.id !== id))
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir issue')
      console.error('Error deleting issue:', err)
      throw err
    }
  }, [])

  const assignIssue = useCallback(async (id: number, assignedTo: number): Promise<Issue> => {
    try {
      setError(null)
      const response = await IssuesAPI.assign(id, assignedTo)
      const updatedIssue = response.issue
      setIssues(prev => prev.map(issue => 
        issue.id === id ? updatedIssue : issue
      ))
      return updatedIssue
    } catch (err: any) {
      setError(err.message || 'Erro ao atribuir issue')
      console.error('Error assigning issue:', err)
      throw err
    }
  }, [])

  const updateIssueStatus = useCallback(async (id: number, status: string): Promise<Issue> => {
    try {
      setError(null)
      const response = await IssuesAPI.updateStatus(id, status)
      const updatedIssue = response.issue
      setIssues(prev => prev.map(issue => 
        issue.id === id ? updatedIssue : issue
      ))
      return updatedIssue
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar status da issue')
      console.error('Error updating issue status:', err)
      throw err
    }
  }, [])

  const resolveIssue = useCallback(async (id: number, resolution: string): Promise<Issue> => {
    try {
      setError(null)
      const response = await IssuesAPI.resolve(id, resolution)
      const updatedIssue = response.issue
      setIssues(prev => prev.map(issue => 
        issue.id === id ? updatedIssue : issue
      ))
      return updatedIssue
    } catch (err: any) {
      setError(err.message || 'Erro ao resolver issue')
      console.error('Error resolving issue:', err)
      throw err
    }
  }, [])

  const getUserIssues = useCallback((userId: number): Issue[] => {
    return issues.filter(issue => issue.reporterId === userId)
  }, [issues])

  const getAssignedIssues = useCallback((userId: number): Issue[] => {
    return issues.filter(issue => issue.assigneeId === userId)
  }, [issues])

  const getOpenIssues = useCallback((): Issue[] => {
    return issues.filter(issue => issue.status === 'open')
  }, [issues])

  const getResolvedIssues = useCallback((): Issue[] => {
    return issues.filter(issue => issue.status === 'resolved')
  }, [issues])

  const value: IssueContextType = {
    issues,
    loading,
    error,
    fetchIssues,
    fetchIssueById,
    createIssue,
    updateIssue,
    deleteIssue,
    assignIssue,
    updateIssueStatus,
    resolveIssue,
    getUserIssues,
    getAssignedIssues,
    getOpenIssues,
    getResolvedIssues
  }

  return (
    <IssueContext.Provider value={value}>
      {children}
    </IssueContext.Provider>
  )
}

export function useIssues() {
  const context = useContext(IssueContext)
  if (context === undefined) {
    throw new Error('useIssues must be used within an IssueProvider')
  }
  return context
}
