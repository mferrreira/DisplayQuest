"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useResponsibility } from "@/contexts/responsibility-context"
import { useIssues } from "@/contexts/issue-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScheduleTab } from "@/components/features/laboratorio/schedule-tab"
import { ResponsibilityTab } from "@/components/features/laboratorio/responsibility-tab"
import { IssuesTab } from "@/components/features/laboratorio/issues-tab"

const TAB_QUERY_KEY = "tab"

function LabTabs({ labUsersLoading }: { labUsersLoading: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get(TAB_QUERY_KEY)
  const activeTab = ["agenda", "responsabilidade", "reclamacoes"].includes(rawTab || "")
    ? (rawTab as string)
    : "agenda"

  const handleTabChange = (value: string) => {
    router.replace(`?${TAB_QUERY_KEY}=${value}`, { scroll: false })
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="agenda">Agenda</TabsTrigger>
        <TabsTrigger value="responsabilidade">Responsabilidade</TabsTrigger>
        <TabsTrigger value="reclamacoes">Reclamações</TabsTrigger>
      </TabsList>

      <TabsContent value="agenda">
        <ScheduleTab labUsersLoading={labUsersLoading} />
      </TabsContent>

      <TabsContent value="responsabilidade">
        <ResponsibilityTab />
      </TabsContent>

      <TabsContent value="reclamacoes">
        <IssuesTab />
      </TabsContent>
    </Tabs>
  )
}

export default function LabResponsibilityPage() {
  const { user, loading: authLoading } = useAuth()
  const { loading: labUsersLoading } = useUser()
  const router = useRouter()
  const {
    error,
  } = useResponsibility()

  const { error: issuesError } = useIssues()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 container mx-auto p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-6">Laboratório</h1>

        {(error || issuesError) && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || issuesError}</AlertDescription>
          </Alert>
        )}

        <Suspense fallback={<p className="text-muted-foreground">Carregando...</p>}>
          <LabTabs labUsersLoading={labUsersLoading} />
        </Suspense>
      </main>
    </div>
  )
}
