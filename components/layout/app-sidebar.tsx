"use client";

import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";
import { getNavigationGroups, isNavItemActive } from "@/components/layout/nav-config";
import { NavItemLink } from "@/components/layout/nav-item-link";

/**
 * AppSidebar — plan-v6 · V6-2 (RF-V6.3, DEC-106, AC-V6-08/09).
 *
 * A sidebar desktop persistente nasce aqui, construída a partir do `nav-config.ts` —
 * mesma fonte, mesma filtragem `FEATURE_ACCESS`, nenhum destino novo (DEC-112 rejeita os
 * rótulos Times/Inventário/Gamificação que aparecem nas referências). O `<header>` continua
 * no DOM acima (shell.spec.ts trava); em telas estreitas a sidebar some e vale o `Sheet`
 * do `mobile-menu.tsx` (R5).
 *
 * Tokens: usa os `--sidebar-*` que já existem nos dois temas em `app/globals.css` —
 * zero CSS novo (DEC-110). O header é `h-16`, então a sidebar cola embaixo dele
 * (`top-16`, altura `100vh - 4rem`) e rola sozinha.
 */
export function AppSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const groups = getNavigationGroups(user?.roles ?? []);

  return (
    <aside
      aria-label="Navegação principal"
      className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block"
    >
      {/* Lista plana, como nas referências: sem cabeçalho de grupo na sidebar — o grupo
          "Projetos" sobre o item "Projetos" (e "Laboratório" sobre "Laboratório") leria
          como defeito. Os grupos do nav-config continuam valendo no Sheet mobile. */}
      <nav className="space-y-1 px-3 py-6">
        {groups.flatMap((group) =>
          group.items.map((item) => (
            <NavItemLink
              key={item.href}
              item={item}
              active={isNavItemActive(item, pathname)}
              surface="sidebar"
            />
          )),
        )}
      </nav>
    </aside>
  );
}
