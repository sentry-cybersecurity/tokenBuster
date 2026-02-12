
FROM node:18-bullseye-slim AS deps
WORKDIR /app


RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*


COPY package.json package-lock.json ./
COPY patches ./patches


RUN npm ci && npx patch-package

FROM node:18-bullseye-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/patches ./patches

COPY . .

RUN npm run build

FROM node:18-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN groupadd -g 1001 nodejs && useradd -m -u 1001 -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
