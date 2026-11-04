/**
 * S05 (plan-v12, DEC-239) — regras puras do recorte de capa.
 *
 * Congelam: zoom entra em [1, 4]; o centro entra na janela que o zoom permite
 * ([1/(2z), 1 - 1/(2z)] por eixo), com zoom 1 forçando centro 0.5; o transform da peça
 * única de render desloca o centro escolhido para o centro da moldura.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_BANNER_CROP_ZOOM,
  MIN_BANNER_CROP_ZOOM,
  bannerCropCenterBounds,
  bannerCropBandRect,
  bannerCropTransform,
  clampBannerCrop,
  clampCropCenterToBand,
} from "@/backend/domain";

describe("regras de recorte de capa", () => {
  it("zoom fora de [1, 4] entra no intervalo", () => {
    expect(clampBannerCrop({ x: 0.5, y: 0.5, zoom: 0.2 }).zoom).toBe(MIN_BANNER_CROP_ZOOM);
    expect(clampBannerCrop({ x: 0.5, y: 0.5, zoom: 9 }).zoom).toBe(MAX_BANNER_CROP_ZOOM);
  });

  it("zoom 1 só aceita centro 0.5 — a janela é a imagem inteira", () => {
    const clamped = clampBannerCrop({ x: 0.1, y: 0.9, zoom: 1 });
    expect(clamped).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  });

  it("zoom 2 aceita centro em [0.25, 0.75] eclampa o resto", () => {
    expect(bannerCropCenterBounds(2)).toEqual({ lo: 0.25, hi: 0.75 });
    expect(clampBannerCrop({ x: 0.9, y: 0, zoom: 2 })).toEqual({ x: 0.75, y: 0.25, zoom: 2 });
    expect(clampBannerCrop({ x: 0.6, y: 0.4, zoom: 2 })).toEqual({ x: 0.6, y: 0.4, zoom: 2 });
  });

  it("zoom 4 não deixa centro fora de [0.125, 0.875]", () => {
    const clamped = clampBannerCrop({ x: 0.95, y: 0.05, zoom: 4 });
    expect(clamped.x).toBeCloseTo(0.875, 6);
    expect(clamped.y).toBeCloseTo(0.125, 6);
    // A janela 1/4 cabe inteira na imagem: da borda do centro até a borda da janela é 1/8.
    expect(clamped.x - 1 / (2 * clamped.zoom)).toBeGreaterThanOrEqual(0);
    expect(clamped.x + 1 / (2 * clamped.zoom)).toBeLessThanOrEqual(1);
  });

  it("transform: escala é o zoom; centro escolhido vai ao centro da moldura", () => {
    expect(bannerCropTransform({ x: 0.5, y: 0.5, zoom: 2 })).toEqual({
      scale: 2,
      offsetXPct: 0,
      offsetYPct: 0,
    });
    expect(bannerCropTransform({ x: 0.75, y: 0.25, zoom: 2 })).toEqual({
      scale: 2,
      offsetXPct: -25,
      offsetYPct: 25,
    });
  });

  describe("faixa no editor (razão natural da imagem)", () => {
    it("zoom 1 sobre imagem 21:9 cobre a imagem inteira", () => {
      const band = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 1 }, 21 / 9);
      expect(band.width).toBeCloseTo(1, 6);
      // altura = largura · 9/21 · (largura natural/altura natural); para 21:9 dá a altura da imagem.
      expect(band.height).toBeCloseTo(1, 6);
      expect(band.left).toBeCloseTo(0, 6);
      expect(band.top).toBeCloseTo(0, 6);
    });

    it("zoom 2 sobre imagem 21:9: faixa de 1/2 de largura, 1/2 de altura, centrada", () => {
      const band = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 2 }, 21 / 9);
      expect(band.width).toBeCloseTo(0.5, 6);
      expect(band.height).toBeCloseTo(0.5, 6);
      expect(band.left).toBeCloseTo(0.25, 6);
      expect(band.top).toBeCloseTo(0.25, 6);
    });

    it("banda-aware: zoom 3, centro 0.9 sai em 5/6; para imagem 21:9 a janela é [1/6, 5/6]", () => {
      expect(clampCropCenterToBand({ x: 0.9, y: 0.5, zoom: 3 }, 21 / 9)).toEqual({
        x: 1 - 1 / 6,
        y: 0.5,
        zoom: 3,
      });
    });

    it("para imagem mais larga que a moldura pede, a faixa não cabe em Y: o centro fica no meio de Y", () => {
      // Imagem muito larga (aspect 3): faixa de altura 9/21·3 = 9/7 > 1. Zoom 1 não deixa
      // centro livre em Y, e a faixa é fixada em cima.
      const clamped = clampCropCenterToBand({ x: 0.5, y: 0.9, zoom: 1 }, 3);
      expect(clamped.y).toBe(0.5);
    });
  });
});
