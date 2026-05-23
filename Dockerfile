FROM node:20-bookworm-slim AS base

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

FROM base AS dev

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev:frontend", "--", "--host", "0.0.0.0"]

FROM base AS build

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production

COPY --from=build /usr/src/app/dist /usr/share/nginx/html
EXPOSE 80
