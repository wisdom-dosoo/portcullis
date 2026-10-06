# Ship-checklist: production web image (Next.js standalone, non-root).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* is baked at build time — pass via --build-arg in CI/Helm.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_SSO_SLUG=sso
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SSO_SLUG=$NEXT_PUBLIC_SSO_SLUG \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN addgroup -S portcullis && adduser -S portcullis -G portcullis
COPY --from=builder --chown=portcullis:portcullis /app/.next/standalone ./
COPY --from=builder --chown=portcullis:portcullis /app/.next/static ./.next/static
COPY --from=builder --chown=portcullis:portcullis /app/public ./public
USER portcullis
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/login').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
