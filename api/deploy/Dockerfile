FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim AS runtime
RUN groupadd -r portcullis && useradd -r -g portcullis portcullis
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY deploy/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh && chown -R portcullis:portcullis /app
USER portcullis
EXPOSE 8080 10000
# Render does its own HTTP health check (see render.yaml healthCheckPath=/livez);
# this is for local docker / self-host. Uses $PORT when set, falls back to 8080,
# and hits /livez (liveness) so Neon/Upstash cold starts don't fail the check.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import os,sys,urllib.request; p=os.environ.get('PORT','8080'); r=urllib.request.urlopen(f'http://localhost:{p}/livez', timeout=5); sys.exit(0 if 200 <= r.status < 400 else 1)"
ENTRYPOINT ["./entrypoint.sh"]
