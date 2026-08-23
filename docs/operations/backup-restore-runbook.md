# Backup and Restore Runbook

## Overview

This runbook covers backup and disaster recovery procedures for Portcullis.

## Backup Strategy

| Component | Method | Schedule | Retention | Storage |
|-----------|--------|----------|-----------|---------|
| PostgreSQL | pg_dump (compressed) | Daily 02:00 UTC | 30 days | S3/GCS |
| Redis | RDB snapshot | Every 6 hours | 7 days | S3/GCS |
| Config/Secrets | GitOps (ArgoCD/Flux) | Continuous | Permanent | Git |

## Automated Backup (Helm)

The Helm chart includes a CronJob for PostgreSQL backups:

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  retentionDays: 30
  storage:
    type: s3
    bucket: "portcullis-backups"
    prefix: "postgres"
    region: "us-east-1"
    credentialsSecret: "backup-credentials"
```

### Required Secrets

```bash
kubectl create secret generic backup-credentials \
  --from-literal=access-key-id=YOUR_AWS_KEY \
  --from-literal=secret-access-key=YOUR_AWS_SECRET \
  -n portcullis
```

## Manual Backup Procedures

### PostgreSQL Backup

```bash
# 1. Connect to the cluster
kubectl exec -it -n portcullis pgbouncer-0 -- pg_dump \
  -h pgbouncer -p 6432 \
  -U portcullis -d portcullis \
  --no-owner --no-acl \
  | gzip > portcullis_$(date +%Y%m%d_%H%M%S).sql.gz

# 2. Upload to S3
aws s3 cp portcullis_*.sql.gz s3://portcullis-backups/postgres/

# 3. Verify
aws s3 ls s3://portcullis-backups/postgres/ --human-readable
```

### Redis Backup

```bash
# 1. Trigger BGSAVE
kubectl exec -it -n portcullis redis-master-0 -- redis-cli BGSAVE

# 2. Wait for completion
kubectl exec -it -n portcullis redis-master-0 -- redis-cli LASTSAVE

# 3. Copy RDB file
kubectl cp portcullis/redis-master-0:/data/dump.rdb ./dump_$(date +%Y%m%d_%H%M%S).rdb

# 4. Upload to S3
aws s3 cp dump_*.rdb s3://portcullis-backups/redis/
```

## Restore Procedures

### PostgreSQL Restore

```bash
# 1. List available backups
aws s3 ls s3://portcullis-backups/postgres/ --human-readable

# 2. Download specific backup
aws s3 cp s3://portcullis-backups/postgres/portcullis_20240115_020000.sql.gz .

# 3. Stop application traffic
kubectl scale deployment portcullis --replicas=0 -n portcullis

# 4. Restore database
gunzip -c portcullis_20240115_020000.sql.gz | \
  kubectl exec -i -n portcullis pgbouncer-0 -- psql \
  -h pgbouncer -p 6432 -U portcullis -d portcullis

# 5. Restart application
kubectl scale deployment portcullis --replicas=2 -n portcullis

# 6. Verify
kubectl logs -l app=portcullis -n portcullis --tail=50
curl https://portcullis.example.com/healthz
```

### Redis Restore

```bash
# 1. List available backups
aws s3 ls s3://portcullis-backups/redis/ --human-readable

# 2. Download backup
aws s3 cp s3://portcullis-backups/redis/dump_20240115_020000.rdb .

# 3. Stop Redis (or use replica)
kubectl scale statefulset redis-master --replicas=0 -n portcullis

# 4. Replace RDB file
kubectl cp dump_20240115_020000.rdb portcullis/redis-master-0:/data/dump.rdb

# 5. Restart Redis
kubectl scale statefulset redis-master --replicas=1 -n portcullis

# 6. Verify
kubectl exec -it -n portcullis redis-master-0 -- redis-cli INFO | grep redis_version
```

## Disaster Recovery Scenarios

### Scenario 1: Single Region Outage

**RTO**: 15 minutes | **RPO**: 24 hours

1. Deploy to secondary region using Helm
2. Restore PostgreSQL from latest S3 backup
3. Update DNS/Ingress to point to new region
4. Verify health checks pass

### Scenario 2: Data Corruption

**RTO**: 30 minutes | **RPO**: 24 hours

1. Identify corruption time
2. Restore PostgreSQL from backup before corruption
3. Restore Redis if needed
4. Verify data integrity

### Scenario 3: Accidental Deletion

**RTO**: 10 minutes | **RPO**: 24 hours

1. Restore specific table/row from pg_dump
2. Or restore entire database from backup

```bash
# Restore single table
gunzip -c backup.sql.gz | \
  sed -n '/^COPY public.servers/,/^\\./p' | \
  psql -h pgbouncer -U portcullis -d portcullis
```

## Verification Checklist

After any restore:

- [ ] `healthz` endpoint returns 200
- [ ] MCP proxy works (`POST /mcp/{slug}`)
- [ ] Management API works (`GET /v1/servers`)
- [ ] Metrics endpoint accessible (`/metrics`)
- [ ] Audit logs writing
- [ ] Rate limiting functional
- [ ] RBAC permissions enforced

## Monitoring Backup Health

Add these alerts:

```yaml
- alert: BackupJobFailed
  expr: kube_job_status_failed{job=~"portcullis-backup-.*"} > 0
  for: 0m
  labels:
    severity: critical
  annotations:
    summary: "Portcullis backup job failed"

- alert: BackupOlderThan24h
  expr: time() - kube_job_status_completion_time{job=~"portcullis-backup-.*"} > 86400
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Portcullis backup older than 24 hours"
```

## Testing Schedule

| Test | Frequency | Procedure |
|------|-----------|-----------|
| Full restore | Monthly | Restore to staging environment |
| Table restore | Quarterly | Restore single table |
| Cross-region | Semi-annually | Deploy to DR region |
| Failover | Annually | Full DR drill |

## Contact Information

- **Primary On-Call**: Platform Team
- **Database Admin**: DBA Team
- **Cloud Provider**: AWS/GCP Support
- **Escalation**: Engineering Manager