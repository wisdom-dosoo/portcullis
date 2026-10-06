# Backup restore drill (ship-checklist)

Prove you can recover — a backup you have never restored is a rumor.

## Quarterly drill log

| Date | Operator | Backup used | Target | RTO | RPO | Result |
|------|----------|-------------|--------|-----|-----|--------|
| YYYY-MM-DD | _name_ | s3://portcullis-backups/postgres/… | staging | _xh_ | _xm_ | PASS/FAIL |

Copy this table into your ops tracker. Keep 4 passing quarters for SOC 2.

## Drill procedure (Postgres + Redis + audit DLQ)

1. **Export SOC 2 evidence first** (retention pruning must never destroy
   unexported evidence):
   `GET /v1/audit/export?format=csv` → store alongside the backup.
2. **Restore Postgres** to a staging namespace from the latest CronJob
   artifact (`backup.storage.bucket/prefix`). Verify row counts:
   `SELECT count(*) FROM audit_log; SELECT count(*) FROM mcp_servers;`
3. **Verify audit hash chains** per tenant:
   `python scripts/audit_retention.py --verify` → all `OK`.
4. **Replay the audit DLQ** if the outage spilled events:
   `python scripts/audit_dlq_replay.py --truncate` → counts match the
   spill file line count.
5. **Fail over Redis**: promote sentinel replica, confirm
   `rl:*`, `mcp-session:*`, `registry:cache:*` repopulate without
   `proxy.rate_limit_redis_error` spikes in logs.
6. **Record RTO/RPO** in the table above. RTO target: < 1h. RPO target:
   < 24h (daily backup) or < 1h with WAL archiving.

## Redis persistence (required in production)

Standalone Redis without AOF/RDB loses all rate-limit + session state on
restart (fail-closed → 503s). Enable in your Redis chart:

```yaml
redis:
  master:
    persistence:
      enabled: true
    disableCommands: []
  extraFlags: ["--appendonly yes", "--appendfsync everysec"]
```

Sentinel mode (values.yaml default) already keeps quorum; still enable AOF.
