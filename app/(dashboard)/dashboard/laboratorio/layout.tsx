"use client"

import type { ReactNode } from "react"
import { ResponsibilityProvider } from "@/contexts/responsibility-context"
import { LaboratoryScheduleProvider } from "@/contexts/laboratory-schedule-context"
import { LabEventsProvider } from "@/contexts/lab-events-context"
import { LabNoticesProvider } from "@/contexts/lab-notices-context"
import { IssueProvider } from "@/contexts/issue-context"

export default function LaboratorioLayout({ children }: { children: ReactNode }) {
  return (
    <ResponsibilityProvider>
      <LaboratoryScheduleProvider>
        <LabEventsProvider>
          <LabNoticesProvider>
            <IssueProvider>{children}</IssueProvider>
          </LabNoticesProvider>
        </LabEventsProvider>
      </LaboratoryScheduleProvider>
    </ResponsibilityProvider>
  )
}
