// Dummy data rápido na instância de desenvolvimento (5432): histórico de leaderboard.
// Cria fechamentos de mês (board_month_closes) + linhas por pessoa ATIVA (month_history)
// para os últimos 3 meses, trilha MONTH_POINTS. Não reseta nada — só insere.
import { assertSeedAllowed } from "./guard"
import { PrismaClient } from "@prisma/client"

assertSeedAllowed()

const prisma = new PrismaClient()
const DAY = 24 * 60 * 60 * 1000

function monthKey(offset: number) {
  const base = new Date()
  const d = new Date(base.getFullYear(), base.getMonth() - offset, 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return { key: `${y}-${m}`, year: y, month: d.getMonth() }
}

async function main() {
  const active = await prisma.users.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  })
  if (active.length === 0) {
    console.log("Nenhum usuário ativo. Rode a seed antes.")
    return
  }

  // Placar de cada pessoa por mês. Mapeia por posição na lista ativa para variar a ordem.
  const track = "MONTH_POINTS"
  for (let i = 0; i < 3; i++) {
    const { key, year, month } = monthKey(i + 1)
    const periodStart = new Date(year, month, 1, 0, 0, 0, 0)
    const lastDay = new Date(year, month + 1, 0)
    const periodEnd = new Date(year, month, lastDay.getDate(), 23, 59, 59, 999)

    const existing = await prisma.board_month_closes.findUnique({
      where: { month_track: { month: key, track } },
    })
    if (existing) {
      console.log(`Mês ${key} já tem fechamento — pulando.`)
      continue
    }

    const close = await prisma.board_month_closes.create({
      data: {
        month: key,
        track,
        periodStart,
        periodEnd,
        closedAt: periodEnd,
        triggeredBy: "SYSTEM:MONTH_CLOSE",
        peopleCount: active.length,
        createdAt: periodEnd,
      },
    })

    // Placar: base decrescente por índice + variação por mês, para posições variadas.
    const scored = active
      .map((u, idx) => ({ u, value: 500 - idx * 40 + (i % 3) * 60 - (idx * 7) }))
      .sort((a, b) => b.value - a.value || a.u.id - b.u.id)

    for (let pos = 0; pos < scored.length; pos++) {
      const { u, value } = scored[pos]
      await prisma.month_history.create({
        data: {
          closeId: close.id,
          userId: u.id,
          userName: u.name,
          month: key,
          track,
          value,
          position: pos + 1,
          periodStart,
          periodEnd,
          closedAt: periodEnd,
          createdAt: periodEnd,
        },
      })
    }
    console.log(`Fechamento de ${key}: ${active.length} pessoas, trilha ${track}`)
  }
}

main()
  .catch((e) => {
    console.error("❌ dummy history:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
