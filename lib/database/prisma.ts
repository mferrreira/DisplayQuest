import { Prisma, PrismaClient } from "@prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

/**
 * `query`/`info` sao ruido de desenvolvimento; em producao o log de query despeja uma
 * linha por SQL (o healthcheck de 10s virava `prisma:query SELECT 1` eterno no
 * `docker logs`). `warn`/`error` ficam sempre. Para depurar em producao, defina
 * `PRISMA_LOG_QUERIES=true`.
 */
const logLevels: Prisma.LogLevel[] =
  process.env.NODE_ENV !== "production" || process.env.PRISMA_LOG_QUERIES === "true"
    ? ["query", "info", "warn", "error"]
    : ["warn", "error"]

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: logLevels,
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
