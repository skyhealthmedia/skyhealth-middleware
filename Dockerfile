
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm i
COPY tsconfig.json .
COPY src ./src
COPY openapi.yaml ./openapi.yaml
COPY .env.example ./.env.example
ENV NODE_ENV=production
EXPOSE 8080
RUN npm run build
CMD ["node", "dist/server.js"]
