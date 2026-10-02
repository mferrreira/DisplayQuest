#!/usr/bin/env python3
"""Reporta caracteres suspeitos (fora do repertório latino habitual) nos fontes do documento.

Uso:  python3 scripts/check-docs-charset.py
Sai com código 1 se encontrar algo.
"""
import glob
import sys
import unicodedata

ALLOWED_RANGES = (
    (0x00A0, 0x00FF),   # latin-1 supplement (acentos, º, ª)
    (0x0100, 0x024F),   # latin extended-A/B
    (0x2000, 0x206F),   # general punctuation (aspas, travessões, reticências)
    (0x2070, 0x209F),   # super/subscripts
    (0x20A0, 0x20BF),   # símbolos de moeda
    (0x2190, 0x21FF),   # setas
    (0x2200, 0x22FF),   # operadores matemáticos (≈, ≤, ≥)
    (0x2500, 0x257F),   # box drawing
    (0x25A0, 0x25FF),   # formas geométricas
    (0x2713, 0x2718),   # marcações
    (0x00B7, 0x00B7),   # middle dot
    # Emojis: aparecem apenas ao transcrever literalmente uma mensagem da
    # interface (ex.: "📋 Tarefa Enviada para Revisão"). CJK (U+4E00–U+9FFF),
    # que é o que este gate procura, continua fora de qualquer faixa.
    (0x1F000, 0x1FAFF),  # emojis
)

# Caracteres individuais liberados por descreverem um símbolo que a própria
# interface usa, e não por serem prosa.
ALLOWED_CHARS = {
    "\u26a1",  # ⚡ marcador de tarefa pública no cartão
}


def suspect(ch: str) -> bool:
    if ord(ch) < 128:
        return False
    if ch in ALLOWED_CHARS:
        return False
    return not any(lo <= ord(ch) <= hi for lo, hi in ALLOWED_RANGES)


def main() -> int:
    targets = sorted(
        glob.glob("docs/src/*.md")
        + glob.glob("docs/src-usuario/*.md")
        + glob.glob("docs/diagrams/*.puml")
        + ["docs/theme/document.css", "scripts/build-docs.mjs", "scripts/capture-user-guide.mjs"]
    )
    findings = 0
    for path in targets:
        with open(path, encoding="utf-8") as handle:
            for number, line in enumerate(handle, 1):
                for char in line:
                    if suspect(char):
                        name = unicodedata.name(char, "?")
                        print(
                            f"{path}:{number}: U+{ord(char):04X} {name} -> {line.rstrip()}"
                        )
                        findings += 1
    if findings:
        print(f"\n{findings} caractere(s) suspeito(s).")
        return 1
    print("nenhum caractere suspeito")
    return 0


if __name__ == "__main__":
    sys.exit(main())
