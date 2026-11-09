# Private PDF engine for the Konfigurator (GOTENBERG_URL). Same version as v2 (ADR 008)
# + Open Sans, which Angebot.docx uses (stock image falls back to Noto Sans).
FROM gotenberg/gotenberg:8.40.0@sha256:53073e798c8ef39ea2187e44cb67bab77894ea2509100b94c4fe3b461f7b2996
USER root
COPY fonts/ /usr/local/share/fonts/custom/
RUN fc-cache -f
USER gotenberg
# Public URL → login required for conversions (/health stays open for Fly's check).
# Credentials: fly secrets GOTENBERG_API_BASIC_AUTH_USERNAME / _PASSWORD.
CMD ["gotenberg", "--api-enable-basic-auth"]
