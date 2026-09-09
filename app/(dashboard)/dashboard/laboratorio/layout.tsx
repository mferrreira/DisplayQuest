"use client"

import type { ReactNode } from "react"
import { LaboratoryScheduleProvider } from "@/contexts/laboratory-schedule-context"
import { LabNoticesProvider } from "@/contexts/lab-notices-context"
import { IssueProvider } from "@/contexts/issue-context"

export default function LaboratorioLayout({ children }: { children: ReactNode }) {
  return (
    <LaboratoryScheduleProvider>
      <LabNoticesProvider>
        <IssueProvider>{children}</IssueProvider>
      </LabNoticesProvider>
    </LaboratoryScheduleProvider>
  )
}
