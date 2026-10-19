"use client"

/**
 * Rodapé institucional do shell do /dashboard — versão discreta (dono, V6-11k):
 * APENAS as logos em um canto e o crédito do desenvolvedor no outro; nenhum texto
 * institucional. Duas marcas: o logo do Laboratório Display (asset real, public/LOGO.png)
 * e um espaço RESERVADO para a logo do IFNMG — a caixa pontilhada espera o arquivo
 * oficial; nenhum logo de terceiro é inventado. O campus correto (Januária, não Salinas)
 * fica no title da reserva, em nenhum texto visível.
 *
 * A imprensa (rotas /print, PDF do relatório) esconde o rodapé por CSS (`print:hidden`),
 * porque a exportação não deve carregar o chrome institucional.
 */
export function AppFooter() {
  return (
    <footer className="border-t bg-card print:hidden" title="Instituto Federal do Norte de Minas Gerais — Campus Januária">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-2 md:px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LOGO.png" alt="Laboratório Display" className="h-6 w-6 object-contain" />
          <div className="flex h-6 items-center rounded-md border border-dashed border-border px-2" title="Logo do IFNMG — aguardando o arquivo oficial">
            <span className="text-[10px] text-muted-foreground">Logo IFNMG</span>
          </div>
        </div>
        <p className="text-[11px] leading-tight text-muted-foreground">Desenvolvido por Márcio Martins Ferreira Júnior</p>
      </div>
    </footer>
  )
}
