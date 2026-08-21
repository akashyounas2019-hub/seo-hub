FROM node:20-alpine AS builder

WORKDIR /app

ENV NITRO_PRESET=node-server

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333
ENV HOST=0.0.0.0
ENV NITRO_PRESET=node-server

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public

EXPOSE 3333

CMD ["node", ".output/server/index.mjs"]
