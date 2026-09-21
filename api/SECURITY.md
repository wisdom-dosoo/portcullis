# Security Policy

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities in a public issue. Use the repository's
GitHub Security Advisory reporting flow so the maintainer can investigate privately.

Include the affected component, reproduction steps, expected impact, and any known
mitigations. The maintainer will acknowledge a complete report within seven days and
will coordinate disclosure after a fix or mitigation is available.

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.8.x   | :white_check_mark: |
| < 0.8   | :x:                |

Security support begins with the v0.8.0 release. Only the latest minor release
receives security patches.

## Security Response Process

1. **Triage** — Within 7 days of a report, the maintainer confirms whether the
   issue is valid and assigns a severity (Critical / High / Medium / Low).
2. **Fix development** — A private branch is created for the fix. Critical and
   High issues are addressed within 14 days; Medium within 30 days; Low on the
   next regular release cadence.
3. **Disclosure** — A GitHub Security Advisory is published simultaneously with
   the fix release. The advisory includes:
   - CVE identifier (if requested via GitHub's CNA process)
   - Affected versions
   - Patched version
   - Impact description
   - Mitigation steps for users who cannot upgrade immediately
4. **Notification** — Users who have opted in to security announcements are
   notified via GitHub.

## Signed Releases

Container images published to `ghcr.io/wisdom-dosoo/portcullis` are signed with
[cosign](https://github.com/sigstore/cosign) as part of the CI pipeline. Verify
with:

```bash
cosign verify ghcr.io/wisdom-dosoo/portcullis:<tag> \
  --certificate-identity=...) \
  --certificate-oidc-issuer=...
```

## Security Hardening

Portcullis includes the following security measures by default:

- **Default-deny RBAC** — No server or tool is reachable unless explicitly allowed.
- **API key hashing** — API keys are hashed with argon2id; plaintext is never stored.
- **Origin validation** — Prevents DNS rebinding attacks against the management API.
- **Network policies** — Helm chart deploys Kubernetes NetworkPolicy by default.
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- **Secret management** — Helm chart supports `existingSecret` references and external
  secret operators; plaintext values are only for development.
- **Audit logging** — Every access decision is logged with hash-chain integrity
  verification for tamper detection.
- **Dependency scanning** — CI runs `pip-audit` and `gitleaks` on every PR.

## Scope

The following are in scope for security reports:

- Authentication bypass
- Authorization bypass (RBAC escape)
- Remote code execution
- SQL injection
- Server-side request forgery (SSRF)
- Cross-site scripting (XSS) in the web dashboard
- Denial of service via resource exhaustion (rate-limit bypass)

The following are out of scope:

- Denial of service via legitimate traffic volume
- Vulnerabilities in third-party dependencies (report upstream)
- Issues requiring physical access to the server

## Contact

- **GitHub Security Advisory**: Preferred method (private, tracked)
- **Email**: security@portcullis.dev (if available)
