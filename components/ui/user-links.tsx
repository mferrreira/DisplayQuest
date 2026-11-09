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
  const [faviconBroken, setFaviconBroken] = useState(false)

  return (
    <li className="flex items-center gap-2 text-sm text-foreground">
      <a
        href={link.url}
        className="inline-flex items-center gap-2 text-primary hover:underline"
        rel="noopener noreferrer"
        target="_blank"
        aria-label={link.label}
      >
        {faviconBroken ? (
          <ExternalLink data-testid="link-fallback" aria-hidden="true" className="h-3 w-3" />
        ) : (
          <img
            src={userLinkFavicon(link.url)}
            alt=""
            className="h-3 w-3"
            onError={() => setFaviconBroken(true)}
          />
        )}
        <span>{link.label}</span>
      </a>
    </li>
  )
}
