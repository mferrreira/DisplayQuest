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

  describe("faixa no editor (razão da faixa + razão da imagem)", () => {
    // Razão da faixa na tela = (w·W)/(h·H) = (w/h)·aspect. Quando a imagem já tem a razão da
    // faixa (aspect = bandAspect), a fração da altura é igual à da largura — a faixa cobre a
    // altura plena. A conta antiga (`h = w/bandAspect`) dava `w·9/21` aqui, que é o esticamento
    // reportado pelo dono em 2026-11-04. Estas duas rodadas congelam a conta corrigida.
    it("zoom 1 sobre a faixa 21:9: a imagem 21:9 é coberta inteira (largura 1, altura 1)", () => {
      const band = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 1 }, 21 / 9, 21 / 9);
      expect(band.width).toBeCloseTo(1, 6);
      expect(band.height).toBeCloseTo(1, 6);
      expect(band.left).toBeCloseTo(0, 6);
      expect(band.top).toBeCloseTo(0, 6);
    });

    it("zoom 2 sobre a faixa 21:9: janela de meia largura, meia altura, centrada", () => {
      const band = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 2 }, 21 / 9, 21 / 9);
      expect(band.width).toBeCloseTo(0.5, 6);
      expect(band.height).toBeCloseTo(0.5, 6);
      expect(band.left).toBeCloseTo(0.25, 6);
      expect(band.top).toBeCloseTo(0.25, 6);
    });

    it("faixa quadrada (bandAspect 1): zoom 1 cobre 1x1, zoom 2 dá janela 0,5x0,5", () => {
      const full = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 1 }, 1, 1);
      expect(full.width).toBeCloseTo(1, 6);
      expect(full.height).toBeCloseTo(1, 6);
      const half = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 2 }, 1, 1);
      expect(half.width).toBeCloseTo(0.5, 6);
      expect(half.height).toBeCloseTo(0.5, 6);
      expect(half.left).toBeCloseTo(0.25, 6);
      expect(half.top).toBeCloseTo(0.25, 6);
    });

    it("banda-aware 21:9: zoom 3, centro 0.9 sai em 5/6; para faixa 21:9 a janela é [1/6, 5/6]", () => {
      expect(clampCropCenterToBand({ x: 0.9, y: 0.5, zoom: 3 }, 21 / 9, 21 / 9)).toEqual({
        x: 1 - 1 / 6,
        y: 0.5,
        zoom: 3,
      });
    });

    it("banda-aware quadrada: zoom 3 aceita centro em [1/6, 5/6] em ambos os eixos", () => {
      const clamped = clampCropCenterToBand({ x: 0.95, y: 0.05, zoom: 3 }, 1, 1);
      expect(clamped.x).toBeCloseTo(5 / 6, 6);
      expect(clamped.y).toBeCloseTo(1 / 6, 6);
    });

    it("para faixa quadrada, a janela nunca passa de 1: zoom 1 dá centro único em 0.5", () => {
      const clamped = clampCropCenterToBand({ x: 0.9, y: 0.1, zoom: 1 }, 1, 1);
      expect(clamped).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
    });

    // Defeito medido no navegador em 2026-11-04 (pedido do dono): sobre foto paisagem, a conta
    // antiga (`h = w/bandAspect`) esticava a faixa — quadrado virava retângulo e a faixa 21:9 ia
    // além da moldura da capa. A altura da faixa é fração da ALTURA do contêiner, e a razão da
    // faixa na tela é `(w/h)·aspect`; logo `h = w·aspect/bandAspect` e o piso do zoom é
    // `aspect/bandAspect`. Os testes abaixo congelam a razão medida, não a fórmula.

    it("faixa quadrada sobre paisagem 16:9: zoom 1 não cabe — o piso do zoom é a razão da imagem", () => {
      const clamped = clampCropCenterToBand({ x: 0.5, y: 0.5, zoom: 1 }, 1, 16 / 9);
      expect(clamped.zoom).toBeCloseTo(16 / 9, 6);
      // Janela mínima: altura plena da imagem, largura 9/16 — em px, quadrado.
      const band = bannerCropBandRect(clamped, 1, 16 / 9);
      expect(band.height).toBeCloseTo(1, 6);
      expect(band.width).toBeCloseTo(9 / 16, 6);
      // Razão da faixa na tela: (w·W)/(h·H) com W/H = 16/9.
      expect((band.width * (16 / 9)) / band.height).toBeCloseTo(1, 6);
    });

    it("faixa quadrada sobre paisagem: a janela quadrada nunca estica em nenhum zoom", () => {
      for (const zoom of [16 / 9, 2, 3, 4]) {
        const band = bannerCropBandRect({ x: 0.5, y: 0.5, zoom }, 1, 16 / 9);
        expect((band.width * (16 / 9)) / band.height).toBeCloseTo(1, 6);
      }
    });

    it("faixa 21:9 sobre paisagem 16:9: a razão na tela é 21:9, não 16:9 esticada", () => {
      const band = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 1 }, 21 / 9, 16 / 9);
      expect((band.width * (16 / 9)) / band.height).toBeCloseTo(21 / 9, 6);
    });

    it("faixa 21:9 sobre paisagem 16:9 com zoom 2: mesma razão, janela de meia largura", () => {
      const band = bannerCropBandRect({ x: 0.5, y: 0.5, zoom: 2 }, 21 / 9, 16 / 9);
      expect(band.width).toBeCloseTo(0.5, 6);
      expect((band.width * (16 / 9)) / band.height).toBeCloseTo(21 / 9, 6);
    });

    it("piso do zoom em retrato 3:4: faixa quadrada entra em 0,75 (piso 1 manda, a faixa cabe)", () => {
      const clamped = clampCropCenterToBand({ x: 0.5, y: 0.5, zoom: 1 }, 1, 3 / 4);
      expect(clamped.zoom).toBe(1);
      const band = bannerCropBandRect(clamped, 1, 3 / 4);
      expect((band.width * (3 / 4)) / band.height).toBeCloseTo(1, 6);
    });
  });
});
