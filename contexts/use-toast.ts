"use client"

/**
 * Toast hook — SONNER-BACKED COMPAT SHIM (E1/T1.3).
 *
 * Why: the legacy radix <Toaster/> was only mounted inside loja/page.tsx, so the 17 other
 * useToast() call sites produced INVISIBLE toasts (missing-feedback bug found during T1.3).
 * This shim preserves the exact call surface — `toast({ title, description, variant, action })`,
 * `useToast() -> { toasts, toast, dismiss }` — while rendering through ONE global sonner <Toaster/>
 * mounted in app/client-layout.tsx. Radix primitives (ui/toast.tsx, ui/toaster.tsx) are deleted.
 *
 * Migration rule: NEW/rebuilt feature code imports { toast } from "sonner" directly (or
 * "@/components/ui/sonner" wrapper); this shim dies at E10 once zero callers remain.
 * Known degradation: `action` nodes render via sonner's action slot (label position) until each
 * call site migrates; `.toasts` is always [] because sonner owns render state (no caller reads it).
 */
import * as React from "react"
import { toast as sonnerToast } from "sonner"

type LegacyVariant = "default" | "destructive" | null | undefined

interface LegacyToastProps {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: LegacyVariant
  action?: React.ReactNode
  duration?: number
  [key: string]: unknown
}

function toast(props: LegacyToastProps) {
  const { title, description, variant, action, duration, ...rest } = props

  const options: Parameters<typeof sonnerToast>[1] = {
    description: description ?? undefined,
    ...(duration !== undefined ? { duration } : {}),
    // Sonner expects { label, onClick }; a raw element degrades gracefully as label content.
    ...(action !== undefined ? { action: { label: action as React.ReactNode, onClick: () => {} } } : {}),
    ...rest,
  }

  if (variant === "destructive") {
    return sonnerToast.error(title ?? "Erro", options)
  }
  return sonnerToast(title ?? "", options)
}

function useToast() {
  return {
    toasts: [] as never[],
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
  }
}

export { useToast, toast }
