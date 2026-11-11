# ---- Build stage: compile the Astro site into dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Run stage: slim runtime with the Hono server + built site ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY schema.sql ./schema.sql
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "server/index.js"]
