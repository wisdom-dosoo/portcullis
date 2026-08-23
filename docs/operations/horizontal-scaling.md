# Horizontal Scaling Guide

This guide covers deploying Portcullis in a horizontally scaled configuration for production workloads.

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Gateway 1  │     │  Gateway 2  │     │  Gateway N  │
│  (FastAPI)  │     │  (FastAPI)  │     │  (FastAPI)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
              ┌────────────┴────────────┐
              │      Load Balancer      │
              │   (Cloudflare/NGINX)    │
              └────────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Redis Cluster │ │   PostgreSQL  │ │  PgBouncer    │
│  (Sentinel/    │ │   (Primary +  │ │  (Connection  │
│   Cluster)     │ │    Replicas)  │ │   Pooler)     │
└───────────────┘ └───────────────┘ └───────────────┘
```

## Configuration

### 1. Redis High Availability

#### Sentinel Mode (Recommended for most deployments)

```yaml
# .env
REDIS_MODE=sentinel
REDIS_SENTINEL_MASTER=mymaster
REDIS_SENTINEL_HOSTS=redis-sentinel-1:26379,redis-sentinel-2:26379,redis-sentinel-3:26379
REDIS_MAX_CONNECTIONS=100
REDIS_SOCKET_TIMEOUT_SECONDS=5.0
REDIS_SOCKET_CONNECT_TIMEOUT_SECONDS=5.0
```

#### Cluster Mode (For highest throughput)

```yaml
# .env
REDIS_MODE=cluster
REDIS_URL=redis://redis-cluster:6379
REDIS_MAX_CONNECTIONS=100
```

#### Connection Pool Sizing

| Workers | Max Connections per Worker | Total Connections |
|---------|---------------------------|-------------------|
| 2       | 50                        | 100               |
| 4       | 50                        | 200               |
| 8       | 50                        | 400               |
| 16      | 30                        | 480               |

**Formula**: `redis_max_connections = min(100, max_postgres_connections / worker_count)`

### 2. PostgreSQL with PgBouncer

#### PgBouncer Configuration

```ini
# pgbouncer.ini
[databases]
portcullis = host=postgres-primary port=5432 dbname=portcullis

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 5
max_db_connections = 100
max_user_connections = 100
```

#### Database Connection Limits

```yaml
# .env
DATABASE_URL=postgresql+asyncpg://user:pass@pgbouncer:6432/portcullis
# PgBouncer handles pooling; gateway uses small pool
```

### 3. Gateway Worker Configuration

#### Uvicorn Workers

```bash
# Single worker (baseline)
uvicorn app.main:app --workers 1

# Production (multi-worker)
uvicorn app.main:app --workers 4

# With custom settings
uvicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --limit-concurrency 1000 \
  --limit-max-requests 10000 \
  --timeout-keep-alive 30
```

#### Worker Sizing Guidelines

| Metric | Target | Scaling Trigger |
|--------|--------|-----------------|
| CPU per worker | < 70% | Scale up |
| Memory per worker | < 500MB | Investigate leak |
| Request latency p99 | < 100ms | Scale up |
| Redis connections | < 80% max | Scale up |
| PgBouncer pool usage | < 80% | Scale up |

### 4. Health Check Tuning

#### Gateway Health Endpoint

```yaml
# k8s deployment
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

#### Health Check Intervals

```yaml
# .env
HEALTH_CHECK_INTERVAL_SECONDS=30
HEALTH_CHECK_FAILURE_THRESHOLD=3
UPSTREAM_CONNECT_TIMEOUT_SECONDS=5
UPSTREAM_READ_TIMEOUT_SECONDS=30
```

### 5. Load Balancer Configuration

#### Cloudflare (Recommended)

- Enable **Proxy** (orange cloud) for DDoS protection
- Configure **WAF Rules** to allow `/mcp/*` from known origins
- Set **SSL/TLS** to Full (Strict)
- Enable **HTTP/2** and **HTTP/3**

#### NGINX (Self-hosted)

```nginx
upstream portcullis {
    least_conn;
    server gateway-1:8080 max_fails=3 fail_timeout=30s;
    server gateway-2:8080 max_fails=3 fail_timeout=30s;
    server gateway-3:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name gateway.example.com;

    location /mcp/ {
        proxy_pass http://portcullis;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_cache off;
        proxy_buffering off;
    }

    location /v1/ {
        proxy_pass http://portcullis;
        # Rate limiting handled by gateway
    }
}
```

### 6. Session Affinity

For SSE streams, ensure sticky sessions:

```nginx
# NGINX
upstream portcullis {
    ip_hash;  # Route by client IP
    server gateway-1:8080;
    server gateway-2:8080;
}
```

Or use Redis-backed session store (already implemented):

```yaml
# .env
SESSION_TTL_SECONDS=3600
```

### 7. Monitoring for Scaling Decisions

Key metrics to watch:

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| `portcullis_request_duration_seconds_bucket{le="0.1"}` | p99 > 100ms | Scale up workers |
| `portcullis_rate_limit_rejections_total` | > 100/min | Increase limits or scale |
| `redis_connected_clients` | > 80% maxconn | Increase pool or scale |
| `pgbouncer_pool_usage` | > 80% | Increase pool or scale |
| `portcullis_upstream_health{status="unhealthy"}` | > 0 | Investigate upstream |

## Quick Start: Docker Compose (Scaled)

```yaml
# deploy/docker-compose.scaled.yml
services:
  gateway:
    build: ..
    deploy:
      replicas: 4
    environment:
      - REDIS_MODE=sentinel
      - REDIS_SENTINEL_MASTER=mymaster
      - REDIS_SENTINEL_HOSTS=redis-sentinel:26379
      - REDIS_MAX_CONNECTIONS=50
    depends_on:
      - redis-sentinel
      - pgbouncer

  redis-sentinel:
    image: redis:7-alpine
    command: redis-server /usr/local/etc/redis/sentinel.conf --sentinel
    volumes:
      - ./redis/sentinel.conf:/usr/local/etc/redis/sentinel.conf

  pgbouncer:
    image: edoburu/pgbouncer:latest
    environment:
      DATABASES_HOST: postgres
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 1000
      DEFAULT_POOL_SIZE: 25
    depends_on:
      - postgres
```

## Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| High p99 latency | Check `REQUEST_DURATION` histogram | Add workers, optimize queries |
| Redis OOM | `used_memory` > `maxmemory` | Increase memory, add shards |
| Connection exhaustion | `pgbouncer_pool_usage` > 90% | Increase pool, add PgBouncer |
| Session loss | Redis failover | Verify Sentinel config, TTL |
| Upstream 502 | `upstream_health` metric | Check upstream health endpoints |