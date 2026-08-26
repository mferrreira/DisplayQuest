"use client"

import type { ReactNode } from "react"
import { WeeklyReportProvider } from "@/contexts/weekly-report-context"

export default function WeeklyReportsLayout({ children }: { children: ReactNode }) {
  return <WeeklyReportProvider>{children}</WeeklyReportProvider>
}
