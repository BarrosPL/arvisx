# ARVISX Web - imagem de produção (Next.js standalone)

FROM node:24-alpine AS base

# ===========================
# Instala dependências
# ===========================
FROM base AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ===========================
# Build da aplicação
# ===========================
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Args recebidos do EasyPanel
ARG DATABASE_URL
ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET
ARG OPENAI_API_KEY
ARG ANTHROPIC_API_KEY
ARG CREDENTIALS_ENC_KEY
ARG SCHEDULER_SECRET
ARG SCHEDULER_INTERVAL_MINUTES
ARG SEED_OWNER_EMAIL
ARG SEED_OWNER_PASSWORD
ARG SEED_OWNER_NAME
ARG GOOGLE_ADS_DEVELOPER_TOKEN
ARG GOOGLE_ADS_CLIENT_ID
ARG GOOGLE_ADS_CLIENT_SECRET
ARG META_APP_ID
ARG META_APP_SECRET
ARG GIT_SHA

# Disponibiliza como variáveis de ambiente
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ENV CREDENTIALS_ENC_KEY=${CREDENTIALS_ENC_KEY}
ENV SCHEDULER_SECRET=${SCHEDULER_SECRET}
ENV SCHEDULER_INTERVAL_MINUTES=${SCHEDULER_INTERVAL_MINUTES}
ENV SEED_OWNER_EMAIL=${SEED_OWNER_EMAIL}
ENV SEED_OWNER_PASSWORD=${SEED_OWNER_PASSWORD}
ENV SEED_OWNER_NAME=${SEED_OWNER_NAME}
ENV GOOGLE_ADS_DEVELOPER_TOKEN=${GOOGLE_ADS_DEVELOPER_TOKEN}
ENV GOOGLE_ADS_CLIENT_ID=${GOOGLE_ADS_CLIENT_ID}
ENV GOOGLE_ADS_CLIENT_SECRET=${GOOGLE_ADS_CLIENT_SECRET}
ENV META_APP_ID=${META_APP_ID}
ENV META_APP_SECRET=${META_APP_SECRET}
ENV GIT_SHA=${GIT_SHA}

ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# ===========================
# Imagem final
# ===========================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]