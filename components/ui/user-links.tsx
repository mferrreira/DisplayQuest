"use client"

/**
 * UserLinks — a lista de links do perfil com favicon derivado no render.
 *
 * S09 (R15, DEC-264): nada de favicon no banco. O endereço do serviço público é montado a
 * partir do domínio da URL normalizada, e o navegador carrega a imagem. Quando a imagem falha,
 * o glyph de link entra no lugar, e o link continua visível.
 */
import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { userLinkFavicon, type UserLink } from "@/backend/domain"
import { cn } from "@/lib/utils/utils"

export function UserLinks({ links }: { links: UserLink[] }) {
  if (links.length === 0) return null

  return (
    <section aria-label="Links" className="space-y-3">
      <h3 className="text-sm font-semibold">Links</h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <UserLinkItem key={`${link.label}-${link.url}`} link={link} />
        ))}
      </ul>
    </section>
  )
}

function UserLinkItem({ link }: { link: UserLink }) {
  const [faviconStatus, setFaviconStatus] = useState<"idle" | "loaded" | "broken">("idle")

  return (
    <li className="flex items-center gap-2 text-sm text-foreground">
      <a
        href={link.url}
        className="inline-flex items-center gap-2 text-link hover:underline"
        rel="noopener noreferrer"
        target="_blank"
        aria-label={link.label}
      >
        <ExternalLink
          data-testid="link-fallback"
          aria-hidden="true"
          className={cn("h-3 w-3", faviconStatus === "loaded" && "hidden")}
        />
        <img
          src={userLinkFavicon(link.url)}
          alt=""
          className={cn("h-3 w-3", faviconStatus !== "loaded" && "hidden")}
          onLoad={() => setFaviconStatus("loaded")}
          onError={() => setFaviconStatus("broken")}
        />
        <span>{link.label}</span>
      </a>
    </li>
  )
}
