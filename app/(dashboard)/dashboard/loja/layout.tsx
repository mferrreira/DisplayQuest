"use client"

import type { ReactNode } from "react"
import { RewardProvider } from "@/contexts/reward-context"

export default function LojaLayout({ children }: { children: ReactNode }) {
  return <RewardProvider>{children}</RewardProvider>
}
