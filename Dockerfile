# syntax = docker/dockerfile:1

ARG NODE_VERSION=23.11.0

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS build
# Skip Puppeteer's automatic download during `npm ci`; we install the
# version-matched Chrome explicitly into /app/.cache/puppeteer below so it gets
# copied into the runtime image. (The distro `chromium` package is a newer,
# unpinned build that crashes on launch — see runtime stage.)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential node-gyp pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists/*
COPY package-lock.json package.json ./
RUN npm ci
# Download the Chrome build that matches the installed Puppeteer version.
RUN npx puppeteer browsers install chrome
COPY . .

FROM base AS runtime

ARG LO_VERSION=25.8.6
ARG LO_TARBALL_URL="https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/deb/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_deb.tar.gz"

RUN set -eux; \
  apt-get update -qq; \
  apt-get install --no-install-recommends -y \
    ca-certificates wget xz-utils \
    libdbus-1-3 \
    libcups2 \
    libx11-xcb1 \
    fonts-dejavu-core fontconfig \
    libxinerama1 libxrandr2 libxrender1 libxi6 libxt6 libsm6 libice6 \
    libfreetype6 libfontconfig1 libglib2.0-0 libcairo2 libnss3 \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-lang-german \
    chromium fonts-liberation; \
  rm -rf /var/lib/apt/lists/*

# Puppeteer uses the version-matched Chrome copied in via the build stage's
# cache dir. The distro `chromium` package above is kept only for the shared
# libraries it pulls in (libgbm, libasound, libatk, …) which Chrome needs; its
# own binary crashes on launch (SIGTRAP), so we do NOT point Puppeteer at it.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

RUN set -eux; \
  ARCH="$(dpkg --print-architecture)"; \
  case "$ARCH" in amd64) : ;; *) echo "Unsupported arch: $ARCH"; exit 1 ;; esac; \
  mkdir -p /tmp/lo && cd /tmp/lo; \
  wget -S -O lo.tgz "${LO_TARBALL_URL}"; \
  tar -xzf lo.tgz; \
  dpkg -i LibreOffice_*_Linux_*_deb/DEBS/*.deb || true; \
  apt-get update -qq; \
  apt-get install -y -f --no-install-recommends; \
  ln -sf /opt/libreoffice*/program/soffice /usr/local/bin/soffice; \
  ln -sf /opt/libreoffice*/program/soffice /usr/local/bin/libreoffice; \
  apt-get clean; \
  rm -rf /var/lib/apt/lists/* /tmp/lo

RUN /opt/libreoffice*/program/soffice --version

COPY --from=build /app /app

# Sanity-check that Puppeteer can resolve its bundled Chrome from the cache dir.
RUN node -e "console.log('puppeteer chrome:', require('puppeteer').executablePath())"

EXPOSE 3000
CMD ["npm", "run", "start"]