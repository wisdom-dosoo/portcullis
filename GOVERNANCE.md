# Portcullis Governance

This document is the standing decision record for how Portcullis is governed and
contributed to. The product, licensing, and monetization strategy — including why
every feature is open and how Portcullis Cloud is positioned — lives in
[`docs/strategy.md`](docs/strategy.md). If a question about licensing or gating
comes up, the answer is there, not in a PR description.

## Decision model

- **Licensing: Apache License 2.0, full stop.** Every feature of the gateway
  engine and web dashboard is open, forever, with zero feature gates. There is no
  "Pro tier" and no open-core carve-out. Any proposal to gate a feature, change
  the license, or introduce dual-licensing must be raised in `docs/strategy.md`
  deliberately — not settled feature-by-feature.
- **Commercial product is Portcullis Cloud** — a managed control plane that runs
  Portcullis for you. That is operational infrastructure in a separate, private
  repository. Nothing in the open codebase is "unlocked" by paying.

## Maintainer model

Portcullis is currently run as a **BDFL** (Benevolent Dictator for Life) project:
the founder holds final decision authority over scope, architecture, and
releases. This is the intended starting posture — one codebase, one clear vision.

The project graduates from BDFL to a **core-maintainer team** when:

1. There are **3 or more contributors** with sustained merged PRs (not one-off
   fixes), and
2. At least two of them have been active for **two consecutive release cycles**,
   and
3. They agree to take on the responsibilities below.

At that point the founder documents the transition here: core maintainers share
review, merge, and release duties; disagreements that cannot be resolved by
consensus are settled by the founder until a formal charter exists.

## Core maintainer responsibilities

- Review PRs within their area promptly and constructively.
- Enforce the DCO on every merged commit.
- Keep tests green and documented checks passing before merging.
- Respect the strategy in `docs/strategy.md` — never merge anything that gates a
  feature behind payment, licensing, or an account.
- Escalate disagreements rather than relitigating decisions in the code.

## Contribution sign-off: DCO

Portcullis uses the **Developer Certificate of Origin (DCO)**, not a CLA. By
signing off a commit (`git commit -s`), a contributor certifies they have the
right to submit the code under Apache 2.0. This is the model used by the Linux
kernel and Docker — enough legal traceability for Apache 2.0 compliance without
asking casual contributors for a legal commitment up front.

- Every commit in a merged PR must carry a `Signed-off-by` trailer.
- A `Signed-off-by` trailer must use the contributor's real name and email.

## Contribution guidelines

1. Open or reference an issue that defines the change and its acceptance
   criteria.
2. Keep the change within one architectural boundary.
3. Add tests before behavior when the change introduces executable code.
4. Run the checks documented for that area (see `api/CONTRIBUTING.md`).
5. Explain security and compatibility implications in the pull request.
6. Use focused commits; never include credentials, generated environments,
   coverage artifacts, or editor-specific state.

## Trademark

The "Portcullis" name and logo are trademarked separately from the code license.
Apache 2.0 grants no trademark rights. Forks and redeployments are free to use
the code under Apache 2.0 but may not use the name, logo, or "Portcullis Cloud"
mark, or imply official affiliation without permission. See `docs/strategy.md` §8.

## Changing this document

Changes to the maintainer model, the DCO, or the license decision are substantive
and require the founder's explicit sign-off and a record of why in the commit
message. Changes to process details (review cadence, checks) may be proposed
through a normal PR.