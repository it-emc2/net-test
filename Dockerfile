# syntax = docker/dockerfile:1

ARG NODE_VERSION=23.11.0

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential node-gyp pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists/*
COPY package-lock.json package.json ./
RUN npm ci
COPY . .

FROM base AS runtime

ARG LO_VERSION=25.8.4
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
    texlive-lang-german; \
  rm -rf /var/lib/apt/lists/*

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

EXPOSE 3000
CMD ["npm", "run", "start"]