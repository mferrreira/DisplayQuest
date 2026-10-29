# Servidor MCP do DisplayQuest (plan-v7, fase 1).
# Build em dois estágios: o `tsc` roda no estágio de build e o runtime recebe só
# `dist/` + as dependências de produção.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV MCP_BIND_IP=0.0.0.0
ENV MCP_PORT=8787
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/tools.json ./tools.json
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
