/**
 * Regras puras do recorte de capa (plan-v12, DEC-239).
 *
 * O recorte é um parâmetro, não um corte gravado: centro normalizado (x, y) em 0..1 e zoom
 * >= 1. O zoom define a fração 1/zoom da imagem que a moldura 21:9 mostra; o centro é o ponto
 * da imagem que cai no centro da moldura. Para a janela ficar toda dentro da imagem, o centro
 * tem de cair em [1/(2z), 1 - 1/(2z)] em cada eixo. `clampBannerCrop` é a única conta — o
 * editor e a rota clampam por ela, o render não re-aritmética.
 */

export const MIN_BANNER_CROP_ZOOM = 1;
export const MAX_BANNER_CROP_ZOOM = 4;

export type BannerCropParams = { x: number; y: number; zoom: number };

/** Centro permitido para um zoom: [1/(2z), 1 - 1/(2z)]. */
export function bannerCropCenterBounds(zoom: number): { lo: number; hi: number } {
  const lo = 1 / (2 * zoom);
  return { lo, hi: 1 - lo };
}

/**
 * Zoom fora de [1, 4] entra no intervalo; centro fora da janela que o zoom permite entra na
 * janela. Entrada não-numérica é recusada pela rota antes de chegar aqui.
 */
export function clampBannerCrop(params: BannerCropParams): BannerCropParams {
  const zoom = Math.min(MAX_BANNER_CROP_ZOOM, Math.max(MIN_BANNER_CROP_ZOOM, params.zoom));
  const { lo, hi } = bannerCropCenterBounds(zoom);
  return {
    x: Math.min(hi, Math.max(lo, params.x)),
    y: Math.min(hi, Math.max(lo, params.y)),
    zoom,
  };
}

/**
 * Leitura da tupla de colunas: as três juntas são o recorte; qualquer uma ausente (nula ou nunca
 * escrita) é "sem recorte" — o render cai no corte centrado de hoje. Uma cópia só da conta,
 * consumida pelas telas.
 */
export function bannerCropFromColumns(
  x: number | null | undefined,
  y: number | null | undefined,
  zoom: number | null | undefined,
): BannerCropParams | null {
  if (typeof x !== "number" || typeof y !== "number" || typeof zoom !== "number") return null;
  return { x, y, zoom };
}

/**
 * Transform CSS da moldura sobre a imagem coberta: a escala é o zoom e o deslocamento
 * posiciona o centro escolhido no centro da moldura. Peça única do render — faixa do
 * projeto, perfil, cartão da lista e bloco do campeão consomem todos esta conta.
 */
export function bannerCropTransform(params: BannerCropParams): {
  scale: number;
  offsetXPct: number;
  offsetYPct: number;
} {
  const { lo } = bannerCropCenterBounds(params.zoom);
  // Em cobertura, a imagem desloca (1/2 - x)·100% por eixo para levar o centro à moldura.
  // `(0.5 - x)` e não `-(x - 0.5)`: para x = 0.5 dá 0, e o teste congela 0, não -0.
  return {
    scale: params.zoom,
    offsetXPct: (0.5 - params.x) * 100,
    offsetYPct: (0.5 - params.y) * 100,
  };
}

/**
 * Geometria da faixa no editor (modelo Facebook/LinkedIn, pedido do dono em 2026-11-04):
 * a moldura 21:9 é a faixa que aparece sobre a imagem inteira, arrastável e redimensionável
 * na diagonal. `aspect` é a razão natural da imagem (`naturalWidth / naturalHeight`).
 *
 * A largura da faixa em coordenadas normalizadas é `1/zoom`. A altura, para a faixa ter a
 * razão 21:9 na tela, é `largura · 9/21 · aspect`. O centro (x, y) é o ponto da imagem que
 * cai no centro da faixa. A faixa toda dentro da imagem exige
 * `x ∈ [largura/2, 1 - largura/2]` e `y ∈ [altura/2, 1 - altura/2]`.
 */
export const BANNER_BAND_ASPECT = 21 / 9;
/** Faixa quadrada (logo): razão da faixa = 1 (largura = altura). */
export const SQUARE_BAND_ASPECT = 1;

/**
 * Geometria da faixa no editor. `bandAspect` é a razão da FAIXA (largura/altura): 21/9 para a
 * capa, 1 para o logo quadrado. `aspect` é a razão natural da imagem — a moldura do contêiner
 * segue esta razão, e a faixa se mede dentro dela.
 *
 * Medida no navegador (2026-11-04, defeito reportado pelo dono): a fração `h` é altura da FAIXA
 * como fração da ALTURA do contêiner. Largura em px = `w·W`, altura em px = `h·H`, e a razão da
 * faixa na tela é `(w·W)/(h·H) = (w/h)·aspect`. Para essa razão ser `bandAspect`, a altura tem de
 * ser `h = w·aspect/bandAspect` — usar `w/bandAspect` estica a faixa (faixa quadrada sobre
 * paisagem vira retângulo, que foi exatamente o sintoma).
 */
export function bannerCropBandRect(
  params: BannerCropParams,
  bandAspect: number,
  aspect: number,
): { left: number; top: number; width: number; height: number } {
  const w = 1 / params.zoom;
  const h = (w * aspect) / bandAspect;
  return { left: params.x - w / 2, top: params.y - h / 2, width: w, height: h };
}

/**
 * Clamp band-aware: o zoom tem piso `max(1, aspect/bandAspect)` — abaixo disso a faixa da razão
 * pedida não cabe na imagem (faixa quadrada sobre paisagem não existe com zoom 1: a janela mínima
 * é a altura plena da imagem, que em fração de largura é `1/aspect`), e entra em [piso, 4]. O
 * centro entra na faixa que o zoom permite. Faixa mais alta que a imagem não tem centro possível
 * em Y: ela é recortada em cima e em baixo, e o centro fica no meio do eixo.
 */
export function clampCropCenterToBand(
  params: BannerCropParams,
  bandAspect: number,
  aspect: number,
): BannerCropParams {
  const minZoom = Math.max(MIN_BANNER_CROP_ZOOM, aspect / bandAspect);
  const zoom = Math.min(MAX_BANNER_CROP_ZOOM, Math.max(minZoom, params.zoom));
  const w = 1 / zoom;
  const h = (w * aspect) / bandAspect;
  const xlo = w / 2;
  const xhi = 1 - w / 2;
  const ylo = h / 2;
  const yhi = 1 - h / 2;
  return {
    x: Math.min(xhi, Math.max(xlo, params.x)),
    y: yhi < ylo ? 0.5 : Math.min(yhi, Math.max(ylo, params.y)),
    zoom,
  };
}
