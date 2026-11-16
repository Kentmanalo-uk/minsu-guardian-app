# Two images from one file (docker-compose.yml picks them with `target:`):
#   api — the six API services and the database setup job (compose chooses which with `command:`)
#   web — the React app built and served by Nginx, which also proxies /api/* to the services

# ---------- api ----------
FROM node:22-alpine AS api

WORKDIR /app
COPY package.json package-lock.json ./
COPY modules ./modules
RUN npm ci --omit=dev --ignore-scripts --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
 && npm cache clean --force

COPY database ./database

ENV NODE_ENV=production
USER node

# ---------- web: build ----------
FROM node:22-alpine AS web-build

WORKDIR /app
COPY package.json package-lock.json ./
COPY modules ./modules
RUN npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000

COPY . .
# The browser reaches every service through Nginx on the same address
ENV VITE_AUTH_API_URL=/api/auth \
    VITE_STUDENT_API_URL=/api/students \
    VITE_INCIDENT_API_URL=/api/incidents \
    VITE_CASE_API_URL=/api/cases \
    VITE_REPORT_API_URL=/api/reports \
    VITE_ANALYTICS_API_URL=/api/analytics
RUN npm run build

# ---------- web ----------
FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
