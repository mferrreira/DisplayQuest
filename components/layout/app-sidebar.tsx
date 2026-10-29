"use client";

import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";
import { getNavigationGroups, isNavItemActive } from "@/components/layout/nav-config";
import { NavItemLink } from "@/components/layout/nav-item-link";

/**
 * AppSidebar — plan-v6 · V6-2 (RF-V6.3, DEC-106, AC-V6-08/09).
 *
 * A sidebar desktop sobreposta e recolhível nasce aqui, construída a partir do
 * `nav-config.ts` — mesma fonte, mesma filtragem `FEATURE_ACCESS`, nenhum destino novo
 * (DEC-112 rejeita os rótulos Times/Inventário/Gamificação que aparecem nas referências).
 * O `<header>` continua no DOM acima (shell.spec.ts trava); em telas estreitas a sidebar
 * navegação some e vale o `Sheet` do `mobile-menu.tsx` (R5); o cronômetro de sessão mora
 * no header, não mais no rodapé da sidebar.
 *
 * Tokens: usa os `--sidebar-*` que já existem nos dois temas em `app/globals.css` —
 * zero CSS novo (DEC-110). O header é `h-16`, então a sidebar cola embaixo dele
 * (`top-16`, altura `100vh - 4rem`); só a lista de navegação rola.
 */
export function AppSidebar({ open = false }: { open?: boolean }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const groups = getNavigationGroups(user?.roles ?? []);

  return (
    <aside
      id="primary-navigation-sidebar"
      aria-label="Navegação principal"
      data-state={open ? "open" : "closed"}
      className={`fixed bottom-4 left-auto right-4 top-auto z-40 w-fit overflow-visible md:fixed md:bottom-0 md:left-0 md:right-auto md:top-16 md:flex md:h-[calc(100vh-4rem)] md:w-60 md:flex-col md:overflow-hidden md:border-r md:border-sidebar-border md:bg-sidebar md:text-sidebar-foreground md:shadow-lg md:transition-[transform,visibility,opacity] md:duration-300 md:ease-in-out ${open ? "md:visible md:translate-x-0 md:opacity-100" : "md:invisible md:-translate-x-full md:pointer-events-none md:opacity-0"}`}
    >
      {/* Lista plana, como nas referências: sem cabeçalho de grupo na sidebar — o grupo
          "Projetos" sobre o item "Projetos" (e "Laboratório" sobre "Laboratório") leria
          como defeito. Os grupos do nav-config continuam valendo no Sheet mobile. */}
      <nav aria-hidden={!open} inert={!open} className="hidden min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-6 md:block">
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
