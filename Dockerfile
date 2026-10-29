# Образ для власного сервера: сайт (dist/) + сервер API (dist-server/).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Публічні значення вбудовуються в сайт під час збірки.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_TELEGRAM_BOT_USERNAME
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
RUN npm run build && npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
