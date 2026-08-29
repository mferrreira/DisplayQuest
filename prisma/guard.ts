// A6: seed de desenvolvimento bloqueado fora de NODE_ENV=development.
// seed.dev.ts zera o banco e cria usuários com senha padrão ("123") — nunca deve
// rodar em produção/staging. Importe a seed APENAS VIA import dinâmico após a guarda.
export function assertSeedAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (nodeEnv !== "development") {
    throw new Error(
      "Seed de desenvolvimento bloqueada: defina NODE_ENV=development para executá-la.",
    )
  }
}