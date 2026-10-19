"use client"

/**
 * Rodapé institucional do shell do /dashboard — versão discreta (dono, V6-11k):
 * APENAS as logos em um canto e o crédito do desenvolvedor no outro; nenhum texto
 * institucional. As três marcas (CNPq, IFNMG, Laboratório Display) têm uma variante por
 * modo (arquivos `*_modo-claro`/`*_modo-escuro` em public/); a troca é CSS puro via o
 * `dark:` do Tailwind (o ThemeProvider usa attribute="class"), então nenhuma logo pisca
 * no SSR e nenhum JS decide imagem.
 *
 * O campus correto (Januária, não Salinas) mora no title do rodapé, em nenhum texto visível.
 *
 * A imprensa (rotas /print, PDF do relatório) esconde o rodapé por CSS (`print:hidden`),
 * porque a exportação não deve carregar o chrome institucional.
 */
// Altura por logo: a proporcao que faz as tres parecerem do mesmo tamanho e a do DESENHO
// (marca ~36-43px), nao a da caixa. CNPq e Display tem a marca em ~80% da altura; o IFNMG e
// empilhado (marca ~43% + texto), entao precisa de ~2x a altura para a marca ficar do mesmo
// porte e o texto interno ficar legivel.
const LOGOS = [
  { alt: "CNPq", claro: "/cnpq_logo_modo-claro.png", escuro: "/cnpq_logo_modo-escuro.png", altura: "h-12" },
  { alt: "IFNMG — Campus Januária", claro: "/logo_ifnmg_modo-claro.png", escuro: "/logo_ifnmg_modo-escuro.png", altura: "h-24" },
  { alt: "Laboratório Display", claro: "/logo_display_modo-claro.png", escuro: "/logo_display_modo-escuro.png", altura: "h-12" },
]

export function AppFooter() {
  return (
    <footer className="border-t bg-card print:hidden" title="Instituto Federal do Norte de Minas Gerais — Campus Januária">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-6">
          {LOGOS.map((logo) => (
            <span key={logo.alt} className="flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.claro} alt={logo.alt} className={`${logo.altura} w-auto object-contain dark:hidden`} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.escuro} alt={logo.alt} className={`${logo.altura} hidden w-auto object-contain dark:block`} />
            </span>
          ))}
        </div>
        <p className="text-[11px] leading-tight text-muted-foreground">Desenvolvido por Márcio Martins Ferreira Júnior</p>
      </div>
    </footer>
  )
}
