# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Instala dependências
COPY package.json package-lock.json* ./
RUN npm i --legacy-peer-deps

# Copia arquivos do Prisma
COPY prisma ./prisma/

# Gera Prisma Client
RUN npx prisma generate

# Copia todo o código
COPY . .

# Build do Next.js
RUN npm run build

# Stage 2: Produção
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Instala todas as dependências (incluindo dev para Prisma)
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps && npm cache clean --force

# Copia arquivos do Prisma e Client já gerado
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/

# Cria usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia arquivos do build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Garante que o usuário nextjs (uid 1001) consiga gravar em /app/public/uploads
# em runtime (avatares e relatórios fazem upload pro disco). A permissão é
# herdada pelo volume nomeado `uploads_data` do docker-compose, que persiste
# entre rebuilds (mesmo padrão do postgres_data).
RUN mkdir -p /app/public/uploads && chown -R nextjs:nogroup /app/public/uploads

# Copia CLI
COPY cli ./cli/

# Muda para usuário não-root
USER nextjs
EXPOSE 3000

# Inicia o servidor Next.js diretamente
CMD ["node", "server.js"]
