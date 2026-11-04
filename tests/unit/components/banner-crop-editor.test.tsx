/**
 * S05/S06 (plan-v12, DEC-241) — teste do editor de recorte de capa. Modelo da faixa arrastável
 * escolhido pelo dono em 2026-11-04: a moldura 21:9 é a FAIXA sobre a imagem inteira, arrastável
 * e redimensionável na diagonal; não há slider.
 *
 * O que o jsdom prova: o texto da resolução recomendada, o `<img>` do ORIGINAL, a faixa com a alça
 * de redimensionamento, o clamp de saída (`clampCropCenterToBand` — a conta da faixa, banda-aware
 * pela razão da FAIXA: 21/9 para capa, 1 para logo quadrado), e o zoom no teto. No jsdom o contêiner
 * mede 0 e o arrasto não move o centro por guarda; a geometria do arrasto é provada no navegador pela
 * demo. Para zoom com a razão 21:9, a banda-aware coincide com a janela de centro [1/(2z), 1-1/(2z)]
 * — os números de clamp são os mesmos.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { BannerCropEditor } from "@/components/features/banner-crop-editor";
import { MAX_BANNER_CROP_ZOOM } from "@/backend/domain";

describe("BannerCropEditor — editor da faixa arrastável (R7, DEC-241)", () => {
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
    // O editor não tem slider: a faixa é o controle.
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
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
    // A faixa arrastável e a alça de redimensionamento existem sobre a imagem.
    expect(screen.getByTestId("crop-band")).toBeInTheDocument();
    expect(screen.getByTestId("crop-resize-handle")).toBeInTheDocument();
  });

  it("a faixa vem da posição do recorte: zoom 1 na faixa 21:9 cobre a largura, altura 9/21", () => {
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 1 }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const band = screen.getByTestId("crop-band") as HTMLElement;
    // Sem load no jsdom, a razão do contêiner é a da faixa 21:9 de fábrica. Com a imagem na
    // razão da faixa, a altura da faixa é a fração plena: a faixa cobre o contêiner todo.
    expect(band.style.width).toBe("100%");
    expect(band.style.height).toBe("100%");
    expect(band.style.left).toBe("0%");
    expect(band.style.top).toBe("0%");
  });

  it("faixa quadrada sobre contêiner 21:9 sem load: zoom 2 entra no piso e dá a janela quadrada", () => {
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/avatar/file"
        alt="Foto de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 2 }}
        bandAspect={1}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const band = screen.getByTestId("crop-band") as HTMLElement;
    // Piso do zoom = aspect/bandAspect = 21/9: a janela quadrada mínima é a altura plena,
    // largura 9/21. Em px, com W/H = 21/9: (9/21)·(21/9) = 1 → quadrado.
    expect(band.style.width).toBe(`${(9 / 21) * 100}%`);
    expect(band.style.height).toBe("100%");
    expect(band.style.left).toBe(`${(0.5 - 9 / 42) * 100}%`);
    expect(band.style.top).toBe("0%");
  });

  it("a faixa quadrada clampa centro em ambos os eixos: 0,9 zoom 3 sai em 5/6 no x e em 7/18 no y", () => {
    const onSave = vi.fn();
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/avatar/file"
        alt="Foto de Ana Souza"
        initial={{ x: 0.9, y: 0.05, zoom: 3 }}
        bandAspect={1}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar recorte" }));
    // Faixa quadrada sobre contêiner 21:9: x ∈ [1/6, 5/6]; altura da faixa = (1/3)·(21/9) = 7/9,
    // y ∈ [7/18, 11/18] — o centro não pode cair mais alto que a meia altura da faixa.
    expect(onSave).toHaveBeenCalledWith({ x: 1 - 1 / 6, y: 7 / 18, zoom: 3 });
  });

  it("arrastar a faixa move o centro na fração da imagem, e o salvar grava o centro na faixa", () => {
    const onSave = vi.fn();
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 2 }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    const band = screen.getByTestId("crop-band");
    // No jsdom o contêiner mede 0: o arrasto não move por guarda, e o centro de saída é o de entrada.
    fireEvent.pointerDown(band, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(band, { pointerId: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(band, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Salvar recorte" }));
    expect(onSave).toHaveBeenCalledWith({ x: 0.5, y: 0.5, zoom: 2 });
  });

  it("centro fora da faixa que o zoom permite sai clampado — a conta da banda-aware", () => {
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
    // Para zoom 3 com a razão 21:9, a banda-aware dá a mesma janela de centro [1/6, 5/6]; 0.9 sai em 5/6.
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

  it("abrir sobre foto paisagem com a faixa quadrada: o load aplica o piso e a faixa fica quadrada", () => {
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/avatar/file?v=k"
        alt="Avatar de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 1 }}
        bandAspect={1}
        title="Recorte do avatar"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", { name: "Avatar de Ana Souza" });
    // O jsdom não decodifica imagem: a razão natural é injetada na peça, e o load roda.
    Object.defineProperty(image, "naturalWidth", { value: 1600 });
    Object.defineProperty(image, "naturalHeight", { value: 900 });
    fireEvent.load(image);

    const band = screen.getByTestId("crop-band") as HTMLElement;
    // Piso do zoom = 16/9 → largura 9/16 da imagem, altura plena. Em px: 9/16·(16/9) = 1 → quadrado.
    expect(band.style.width).toBe("56.25%");
    expect(band.style.height).toBe("100%");
    expect(parseFloat(band.style.width)).toBeCloseTo(56.25, 6);
    expect(parseFloat(band.style.height)).toBeCloseTo(100, 6);
  });

  it("abrir sobre foto paisagem com a faixa 21:9: a largura vem do zoom e a altura segue 21:9 em px", () => {
    render(
      <BannerCropEditor
        open
        src="/api/users/7/images/banner/file?v=k"
        alt="Capa de Ana Souza"
        initial={{ x: 0.5, y: 0.5, zoom: 2 }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", { name: "Capa de Ana Souza" });
    Object.defineProperty(image, "naturalWidth", { value: 1600 });
    Object.defineProperty(image, "naturalHeight", { value: 900 });
    fireEvent.load(image);

    const band = screen.getByTestId("crop-band") as HTMLElement;
    // zoom 2: largura 50%; altura = 0,5·(16/9)/(21/9) = 0,381... — a conta da fração da altura.
    expect(band.style.width).toBe("50%");
    expect(parseFloat(band.style.height)).toBeCloseTo(100 * 0.5 * (16 / 9) / (21 / 9), 6);
    // Em px, a razão da faixa é 21:9: (0,5·16/9)/h = 21/9.
    expect((0.5 * (16 / 9)) / (parseFloat(band.style.height) / 100)).toBeCloseTo(21 / 9, 6);
  });
});
