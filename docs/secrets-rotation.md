# Secrets rotation (v1.2)

How to rotate every credential Portcullis depends on without downtime, plus how
to stop managing them by hand via an external secret operator.

## What lives where

| Secret | Source | Stored as | Rotate by |
|---|---|---|---|
| `API_KEY_PEPPER` | env / Helm `secrets.apiKeyPepper` / `existingSecret` | never in DB; mixed into every Argon2 hash | re-issuance (below) |
| API keys (`pk_*`) | `POST /v1/api-keys` | Argon2 hash only; plaintext shown once | dual-issue + revoke |
| `DATABASE_URL` password | env / Helm `postgresql.auth.password` / external DB | Postgres role | `ALTER ROLE ... PASSWORD` + rolling restart |
| `REDIS_URL` password / Sentinel | env / Helm `redisExternal.password` | Redis ACL | `ACL SETUSER` + restart |
| `SSO_OIDC_CLIENT_SECRET` | env / Helm `ssoOidcClientSecret` | process config only | IdP dashboard + restart |
| Upstream `PORTCULLIS_UPSTREAM_TOKEN_*` | upstream owner's vault | env on the gateway pods | upstream rotation + pod restart |
| `STRIPE_*`, `SENDGRID_*`, `RESEND_*` | env | process config only | provider dashboard + restart |

## API_KEY_PEPPER rotation (re-issuance, not in place)

The pepper is baked into every stored API-key hash, so it cannot be swapped
atomically. Instead:

1. Generate a new pepper: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
2. Deploy it as `API_KEY_PEPPER_NEW` alongside the current `API_KEY_PEPPER`
   (both pods accept old keys; new keys hash with `NEW`).
   - Code support for dual-pepper verify is tracked; until then, do a
     maintenance window: announce expiry, issue replacement keys per tenant
     (`POST /v1/api-keys`, `scopes` preserved), then flip the pepper and
     restart. Old hashes fail closed on restart — that is the safety property.
3. Verify: `GET /v1/api-keys` with a fresh key returns 200; an old key returns 401.
4. Delete the old pepper from history (`helm history` keeps inline
   `secrets.*` — prefer `existingSecret`, see below).

## API key rotation (no downtime)

1. Issue replacement: `POST /v1/api-keys {"name":"svc-2026-06","scopes":[...]}`.
   Store the one-time `plaintext` in your vault.
2. Roll the caller to the new key; keep the old key active during propagation.
3. Revoke the old key: `DELETE /v1/api-keys/{id}` (immediate).
4. Confirm: old key `GET /v1/servers` → 401; audit shows `auth_failure`.

## Postgres / Redis / OIDC secrets

1. Update the source of truth (vault / IdP / `ALTER ROLE` / `ACL SETUSER`).
2. Update the K8s Secret **in place** (same key names):
   `kubectl -n $NS create secret generic portcullis-secrets --from-literal=... --dry-run=client -o yaml | kubectl apply -f -`
3. Rolling restart: `kubectl -n $NS rollout restart deploy/portcullis`.
4. Check `/healthz` and `GET /v1/servers` per replica during the rollout.

## External secret operator guide (stop hand-editing Secrets)

Prefer `secrets.existingSecret` over inline `secrets.*` (inline values land in
`helm history`). Two supported patterns:

### A. External Secrets Operator (AWS/GCP/Vault)

```yaml
# externalsecret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: portcullis-secrets
spec:
  refreshInterval: 1h
  secretStoreRef: { kind: ClusterSecretStore, name: vault }
  target: { name: portcullis-secrets, creationPolicy: Owner }
  data:
    - secretKey: API_KEY_PEPPER
      remoteRef: { key: portcullis/prod, property: API_KEY_PEPPER }
    - secretKey: DATABASE_URL
      remoteRef: { key: portcullis/prod, property: DATABASE_URL }
    - secretKey: REDIS_URL
      remoteRef: { key: portcullis/prod, property: REDIS_URL }
    - secretKey: SSO_OIDC_CLIENT_SECRET
      remoteRef: { key: portcullis/prod, property: SSO_OIDC_CLIENT_SECRET }
```

```bash
helm upgrade portcullis deploy/k8s/helm/portcullis \
  --set secrets.existingSecret=portcullis-secrets
```

### B. Sealed Secrets (GitOps)

```bash
kubeseal --format yaml < secret.yaml > sealed-secret.yaml  # commit this
```

Rotation is then `vault rotate → ESO refresh (≤1h) → rollout restart`. The
gateway never needs Helm re-runs for secret values.

## Incident: suspected leak

1. Revoke affected API keys immediately (`DELETE /v1/api-keys/{id}`).
2. If `API_KEY_PEPPER` leaked: treat as above (re-issuance window) — hashes
   are offline-brute-forceable with the pepper.
3. Rotate `DATABASE_URL`/`REDIS_URL`/upstream tokens even if only the pepper
   leaked (shared history in `api/.env` has caused cross-contamination before).
4. Export SOC 2 evidence (`GET /v1/audit/soc2`) before retention prunes rows.
