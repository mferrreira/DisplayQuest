/**
 * S05 (plan-v12, DEC-241) — teste do editor de recorte de capa.
 *
 * O que o jsdom prova aqui é o CONTRATO da peça: o texto da resolução recomendada, o slider de
 * zoom, o clamp na saída (`clampBannerCrop` — a mesma conta da rota, uma cópia só), e o editor
 * abrindo sobre o ORIGINAL. A geometria do arrasto (deslocamento em px sobre a janela 1/zoom) é
 * provada no navegador pela demo da fatia: no jsdom o contêiner mede 0 e o arrasto, por guarda,
 * não move o centro — é exatamente o caminho "sem contêiner medido" da peça.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { BannerCropEditor } from "@/components/features/banner-crop-editor";
import { MAX_BANNER_CROP_ZOOM } from "@/backend/domain";

describe("BannerCropEditor — editor de recorte estilo Facebook (R7, DEC-241)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a tela diz a resolução recomendada em palavras, com a proporção da moldura", () => {
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file?v=k"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 1 }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/Resolução recomendada: 2100×900 px \(21:9\)/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Recorte da capa" })).toBeInTheDocument();
  });

  it("o editor abre sobre o ORIGINAL que lhe é dado — a URL do binário cai no <img>", () => {
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file?v=original-uuid"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 1 }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const image = screen.getByRole("img", { name: "Capa de Ana Souza" });
    expect(image).toHaveAttribute("src", "/api/users/7/images/banner/file?v=original-uuid");
    // A moldura da pré-visualização é 21:9.
    expect(screen.getByTestId("crop-preview").className).toContain("aspect-[21/9]");
  });

  it("o zoom entra pelo slider e chega na saída", () => {
    const onSave = vi.fn();
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 1 }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Zoom da capa" });
    fireEvent.change(slider, { target: { value: "3" } });
    expect(screen.getByText(/Zoom: 3\.0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar recorte" }));
    expect(onSave).toHaveBeenCalledWith({ x: 0.5, y: 0.5, zoom: 3 });
  });

  it("centro fora da janela que o zoom permite sai clampado — a mesma conta da rota", () => {
    const onSave = vi.fn();
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file"
        alt="Capa de Ana Souza"
        initial={{ x: 0.9, y: 0.5, zoom: 3 }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar recorte" }));
    // Para zoom 3 o centro permitido é [1/6, 5/6]; 0.9 sai em 5/6.
    expect(onSave).toHaveBeenCalledWith({ x: 1 - 1 / 6, y: 0.5, zoom: 3 });
  });

  it("zoom pedido acima do teto sai no teto", () => {
    const onSave = vi.fn();
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 9 }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar recorte" }));
    expect(onSave).toHaveBeenCalledWith({ x: 0.5, y: 0.5, zoom: MAX_BANNER_CROP_ZOOM });
  });

  it("cancelar não grava nada", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 1 }}
        onCancel={onCancel}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});
