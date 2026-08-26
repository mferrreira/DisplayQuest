"use client"

/**
 * /dashboard — Task board (E2/T2.8 swap).
 * Data layer: features/tasks (TanStack Query). Legacy task-context is no longer mounted here.
 */
import { TaskBoard } from "@/features/tasks/components/task-board"

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="container mx-auto flex-1 p-4 md:p-6">
        <h1 className="mb-6 text-2xl font-bold">Painel de Tarefas</h1>
        <TaskBoard />
      </main>
    </div>
  )
}
