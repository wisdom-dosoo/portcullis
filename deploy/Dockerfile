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
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:8080/healthz || exit 1
ENTRYPOINT ["./entrypoint.sh"]
