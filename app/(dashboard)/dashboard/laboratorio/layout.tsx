"use client"

import type { ReactNode } from "react"
import { ResponsibilityProvider } from "@/contexts/responsibility-context"
import { LaboratoryScheduleProvider } from "@/contexts/laboratory-schedule-context"
import { LabNoticesProvider } from "@/contexts/lab-notices-context"
import { IssueProvider } from "@/contexts/issue-context"

export default function LaboratorioLayout({ children }: { children: ReactNode }) {
  return (
    <ResponsibilityProvider>
      <LaboratoryScheduleProvider>
        <LabNoticesProvider>
          <IssueProvider>{children}</IssueProvider>
        </LabNoticesProvider>
      </LaboratoryScheduleProvider>
    </ResponsibilityProvider>
  )
}
