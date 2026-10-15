"use client";

import Link from "next/link";

import { cn } from "@/lib/utils/utils";
import type { NavItemDef } from "@/components/layout/nav-config";

/**
 * NavItemLink — plan-v6 · V6-2 (RF-V6.3 R2).
 * O render do item de navegação existe uma vez: sidebar desktop e menu mobile (Sheet)
 * consomem o mesmo componente, cada um na superfície de tokens do seu contêiner
 * (`--sidebar-*` na sidebar, `accent` no Sheet). Nenhum dos dois usa pill de borda
 * totalmente redonda (AC-V6-09 — anti-pattern "Excessive pills"; o canto é da escala
 * `--radius`).
 */
export interface NavItemLinkProps {
  item: NavItemDef;
  active: boolean;
  /** "sidebar" = tokens --sidebar-*; "sheet" = tokens do popover (menu mobile). */
  surface: "sidebar" | "sheet";
  onNavigate?: () => void;
}

export function NavItemLink({ item, active, surface, onNavigate }: NavItemLinkProps) {
  const surfaceClasses =
    surface === "sidebar"
      ? cn(
          "rounded-lg px-3 py-2",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )
      : cn(
          "rounded-xl px-3 py-2",
          active
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        );

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn("flex items-center gap-3 text-sm transition-colors", surfaceClasses)}
    >
      <item.icon className="h-5 w-5" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}
