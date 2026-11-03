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
