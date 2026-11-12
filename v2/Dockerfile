# syntax=docker/dockerfile:1.7
# OC v2 production image (phase 8, ADR 009). Build from the REPO ROOT:
#   docker build -f v2/Dockerfile -t oc-v2 .
# Contains v2 plus today's UI files and document templates (ADR 021/019) at the paths v2
# expects (/app/src/public, /app/src/templates, /app/src/logic) — no extra settings needed.

FROM node:24-bookworm-slim AS build
WORKDIR /app/v2
COPY v2/package.json v2/package-lock.json ./
COPY v2/packages/config/package.json packages/config/
COPY v2/packages/domain/package.json packages/domain/
COPY v2/packages/pricing/package.json packages/pricing/
COPY v2/apps/server/package.json apps/server/
COPY v2/apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY v2/ ./
RUN npx tsc -b && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app/v2
COPY --from=build /app/v2/package.json ./
COPY --from=build /app/v2/node_modules ./node_modules
COPY --from=build /app/v2/packages ./packages
COPY --from=build /app/v2/apps/server/package.json ./apps/server/
COPY --from=build /app/v2/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/v2/apps/server/dist ./apps/server/dist
COPY --from=build /app/v2/apps/server/src/modules/web/addons ./apps/server/src/modules/web/addons
# today's UI, templates and offline pricing sources (served/used unchanged)
COPY src/public /app/src/public
COPY src/templates /app/src/templates
COPY src/logic /app/src/logic
COPY --from=build /app/v2/node_modules/@fortawesome/fontawesome-free /app/node_modules/@fortawesome/fontawesome-free
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/server.js"]
