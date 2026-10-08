# ==========================================
# ESTÁGIO 1: BUILDER (Compilação TS e Vite)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Argumento para embutir a chave do mapa estaticamente no build do Vite
ARG VITE_CARTO_API_KEY
ENV VITE_CARTO_API_KEY=$VITE_CARTO_API_KEY

# Copia manifestos de pacotes primeiro (aproveitamento máximo do cache de layers)
COPY package*.json ./
COPY client/package*.json ./client/

# Instala todas as dependências (raiz e cliente)
RUN npm ci && npm --prefix client ci

# Copia configurações e código-fonte
COPY tsconfig.json ./
COPY src/ ./src/
COPY client/ ./client/
COPY docs/ ./docs/

# Compila o servidor TypeScript (dist/) e o cliente React Vite (client/dist/)
RUN npm run build

# ==========================================
# ESTÁGIO 2: RUNNER (Imagem Final de Produção)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copia manifestos e instala apenas dependências de produção do servidor
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copia os artefatos compilados a partir do estágio builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY docs/ ./docs/

# Define permissões para o usuário padrão não-root do Node
RUN chown -R node:node /app
USER node

# Expõe a porta principal da aplicação
EXPOSE 3000

# Probe de saúde nativo (usado pelo Docker e Dokploy)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Comando de inicialização do servidor
CMD ["node", "dist/server.js"]
