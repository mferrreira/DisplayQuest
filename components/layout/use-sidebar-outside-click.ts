"use client"

import { useEffect } from "react"

const SIDEBAR_ID = "primary-navigation-sidebar"
const TOGGLE_SELECTOR = 'button[aria-controls="primary-navigation-sidebar"]'

/** Fecha a sidebar desktop quando o usuário interage fora dela. */
export function useSidebarOutsideClick(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!window.matchMedia("(min-width: 768px)").matches) return
      const target = event.target
      if (!(target instanceof Node)) return

      const sidebar = document.getElementById(SIDEBAR_ID)
      const toggle = document.querySelector(TOGGLE_SELECTOR)
      if (sidebar?.contains(target) || toggle?.contains(target)) return

      onClose()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open, onClose])
}
