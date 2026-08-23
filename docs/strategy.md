# Portcullis — Product, Licensing & Monetization Strategy

**Decision: full Coolify model. 100% of the code — gateway engine and web dashboard — is Apache 2.0, forever, with zero feature gates. The product we sell is Portcullis Cloud: a managed control plane, not unlocked functionality.**

This document exists so that decision doesn't get relitigated every time someone asks "should this feature be Pro-only?" The answer is always no. If that answer ever needs to change, it should happen here, deliberately, with the trade-offs written down — not feature-by-feature in a PR description.

---

## Table of Contents

1. [The Decision, and Why](#1-the-decision-and-why)
2. [Prior Art & Positioning](#2-prior-art--positioning)
3. [Licensing Model](#3-licensing-model)
4. [What's Actually Not Open](#4-whats-actually-not-open)
5. [Monetization: Portcullis Cloud](#5-monetization-portcullis-cloud)
6. [Model Comparison](#6-model-comparison)
7. [Governance & Contribution](#7-governance--contribution)
8. [Trademark Policy](#8-trademark-policy)
9. [Risks and Honest Trade-offs](#9-risks-and-honest-trade-offs)
10. [Brand & Design Direction](#10-brand--design-direction)
11. [Productization Roadmap](#11-productization-roadmap)

---

## 1. The Decision, and Why

You came into this wanting "90% limited access, Coolify style." Those two things pull against each other, so this section states plainly which one won and why.

**Coolify itself is not gated.** Self-hosted Coolify is Apache 2.0, free forever, with every feature included — no user caps, no trial period, no locked panels. As of mid-2026 it has 59,800+ GitHub stars, 575+ contributors, and a reported 325,000+ users, and it still makes money, entirely through Coolify Cloud (from $5/month for two connected servers, $3/month per additional server). The lesson isn't "give everything away and hope" — it's that **the paid product is operating the thing for you**, not a feature you're locked out of.

**Gating 90% of features (open-core) is the opposite bet**, and it has real, well-documented costs: it caps how much of your codebase outside contributors will bother touching (why send a PR to the free tier if the interesting problems are in the private one?), it creates constant "is this a Pro feature?" friction for every engineering decision, and it signals distrust to the exact audience — other backend developers — you're trying to win credibility with. GitLab and Grafana Labs make open-core work, but they did it with venture funding and dedicated product teams drawing that line; that's not the right starting posture for a portfolio project trying to earn its first 100 stars and its first outside contributor.

**Decision: reject open-core. Adopt the Coolify model.** Everything in `app/` and `dashboard/` is Apache 2.0. The commercial product is Portcullis Cloud.

---

## 2. Prior Art & Positioning

This product category is not empty — naming that plainly here protects credibility, because anyone technical enough to evaluate this project will find these in one search of their own. Pretending otherwise is worse than addressing it.

| Project | Self-host license | Production-ready dashboard | Audience | Scope | Self-serve hosted tier |
|---|---|---|---|---|---|
| **ContextForge (IBM)** | Fully open, Apache 2.0 | No — Admin UI is localhost-only, disabled by default in production | Kubernetes-first platform teams | Broad (MCP + A2A + REST/gRPC translation) | None |
| **Lunar.dev (MCPX)** | Open-core — RBAC, SSO, secret isolation, and hosting gated behind Enterprise | Enterprise tier only | Fortune 200, Gartner-recognized | MCP-focused | Yes, but sales-gated |
| **MintMCP** | Not really self-hostable | Yes, but SaaS-only | Enterprise compliance buyers (SOC 2, SSO, SCIM) | MCP governance | Yes, sales-led |
| **Microsoft `mcp-gateway`** | Open source | No — a reverse proxy, no RBAC | Azure/Kubernetes teams | Narrow (session-aware routing only) | None |
| **MCPJungle** | Open source | Basic; RBAC stays basic even in "enterprise mode" | Small teams | Lightweight; no credential isolation, no compliance audit trail | None |
| **Bifrost (Maxim AI)** | Open-source core, Go | Unclear/limited | LLM-ops teams | Broad — combined LLM gateway + MCP gateway in one binary | Unclear |
| **Octelium** | Open source | Envoy/Lua config, not a friendly UI | SRE/platform teams | MCP + zero-trust gateway | None |
| **Portcullis** | **Fully open, zero gating** | **Yes, production-grade by default** | **Indie developers & small teams** | **MCP-only, disciplined** | **Yes, self-serve, no sales call** |

**The pattern:** every competitor picks one of three things — a fully open license, a dashboard actually meant for production, or a hosted tier you can sign up for without a sales call — and drops the other two. Nobody does all three at once. That combination is Portcullis's actual position, built from what these projects say about themselves, not from a marketing angle invented after the fact.

**One-line positioning:** *"The only MCP gateway that's fully open, ships a production dashboard, and lets you pay for hosting without talking to a salesperson."*

**How durable this is, honestly:** this is a first-mover window, not a moat. IBM could make ContextForge's Admin UI production-ready in one release cycle; Lunar could un-gate RBAC tomorrow if it wanted the indie market. Nothing in this table is structurally defensible the way a patent or a network effect would be. What actually holds the gap open is speed and trust — shipping the dashboard and the self-serve Cloud tier before they do, and being the project developers already trust because nothing in it was ever hidden from them. This is the same bet named directly in [§9](#9-risks-and-honest-trade-offs): the moat here is execution, not enforcement.

---

## 3. Licensing Model

**Code license: Apache License 2.0**, applied to the entire monorepo (gateway engine + management API + web dashboard).

| License | Copyleft | Can a competitor host your exact code as their own paid service? | Trade-off |
|---|---|---|---|
| **MIT** | None | Yes | Maximally permissive but includes no explicit patent grant — a gap for infrastructure software that touches auth/crypto |
| **Apache 2.0** ✅ | None | Yes | Same permissiveness as MIT plus an explicit patent grant; the standard choice for CNCF-adjacent infrastructure (Kubernetes, and — per Coolify's own stated reasoning — chosen specifically because, unlike AGPL, it carries no network-use disclosure obligation for anyone building on top of it) |
| **AGPL-3.0** | Network-use copyleft | No — anyone running it as a network service must publish their modifications | Protects against "cloud strip-mining," but the same clause makes risk-averse companies avoid adopting the project at all — the opposite of what a portfolio piece needs |
| **BSL (Business Source License)** | Time-delayed | No, for a fixed embargo period (converts to open after N years) | Used by Sentry, CockroachDB, and pre-IBM HashiCorp specifically to block hosted competitors during the embargo — a legitimate choice, but it is not "open source" by OSI's definition, and it undercuts the "fully open, Coolify-style" positioning you asked for |

**Why Apache 2.0 wins for this project specifically:** the goal stated at the top of this conversation was GitHub credibility, contributor trust, and recruiter-visible open-source participation. AGPL and BSL both optimize for *protecting future revenue from a hosted clone* — a real concern for a funded startup, not for a project whose primary near-term value is stars, forks, and outside PRs. Apache 2.0 removes every reason for a cautious engineer or company to hesitate before adopting or contributing.

---

## 4. What's Actually Not Open

To be precise about where the line sits, because "everything is open" still needs a boundary:

**Open (Apache 2.0, in this repo):**
- The gateway engine — registry, proxy, RBAC, rate limiter, observability (everything documented in `README.md`)
- The web dashboard (`dashboard/`, see `docs/dashboard-architecture.md`)
- The Postgres schema, Alembic migrations, Docker image, docker-compose, CI workflows
- Documentation, ADRs, the evaluation suite

**Not open (lives in a separate, private repo — this is operational infrastructure, not product features):**
- The Portcullis Cloud control plane that provisions and manages *other people's* self-hosted instances (multi-tenant billing, provisioning automation, managed-Postgres/Redis orchestration)
- Internal SRE playbooks, on-call runbooks, infrastructure-as-code for your own hosted fleet
- The billing/subscription integration and its credentials

Nobody using self-hosted Portcullis is missing a single gateway feature. What they're missing is *someone else running the infrastructure for them* — which is not code, so it cannot be "unlocked" by reading the repo.

---

## 5. Monetization: Portcullis Cloud

**What self-hosting gets, free, forever:** the entire product — every RBAC rule, every rate-limit strategy, tracing, audit log, the dashboard, unlimited servers, unlimited subjects. No seat limits enforced in code.

**What Portcullis Cloud sells is convenience, not capability:**
- Managed Postgres + Redis (provisioned, backed up, patched)
- One-click "connect a server" flow instead of hand-rolling `docker compose`
- Automatic upgrades with zero-downtime migration handling
- Team/org billing and seat management for the *hosted* instance
- An uptime SLA and support — the thing you genuinely cannot get from a GitHub repo

**Illustrative pricing shape** (explicitly a *model to calibrate against*, not a finalized price list — set real numbers once there's a working product and real hosting-cost data):

| Tier | Illustrative price | Mirrors |
|---|---|---|
| Self-hosted | $0 forever | Coolify self-hosted |
| Cloud starter | ~$5–7/mo, 1–2 connected servers | Coolify Cloud's $5/mo-for-2-servers shape |
| Cloud team | ~$3/mo per additional server + per-seat pricing for org/RBAC management | Coolify's $3/mo-per-additional-server increment |

Coolify is the closest real comparable to price against, not a hypothetical — it's already proven this exact shape supports a business at meaningful scale.

---

## 6. Model Comparison

Stated plainly, across the dimensions that actually matter for a project trying to build both a career story and, eventually, a real product:

| Dimension | Fully closed | Open-core (gated 90%) | **Coolify model (chosen)** |
|---|---|---|---|
| Contributor trust | None — nobody sends a PR to closed code | Medium — contributors suspect their work subsidizes a paywall | High — every contribution improves the product everyone uses |
| GitHub star/fork ceiling | Low | Medium | High — nothing in the repo disappoints a visitor who came for the "open source" label |
| Recruiter/portfolio credibility | Low (nothing to show) | Medium (some skepticism about what's hidden) | High — the full system, including the hard parts, is inspectable |
| Monetization ceiling | High per-customer, low volume | Medium — capped by how much value you're willing to lock away | Proven at Coolify's scale ($5–10/mo × tens of thousands of paying orgs is a real business) |
| Engineering overhead | Low | High — permanent "which tier does this belong in" tax on every feature decision | Low — one codebase, one set of features, no tier logic to maintain |
| Competitive moat | License-enforced | Feature-enforced | **Execution-enforced** — the moat is being the best-run, fastest-updated, easiest-to-trust operator, which is harder to copy than code |

The last row is the honest trade-off: the Coolify model has a *weaker legal moat* than open-core or BSL. It bets that operational excellence is a durable enough advantage. Section 9 addresses this directly rather than hand-waving it.

---

## 7. Governance & Contribution

- **Sign-off model: DCO (Developer Certificate of Origin), not a CLA.** A CLA (assigning copyright to you) maximizes your future legal flexibility but is a documented deterrent to casual contributors — it asks for a legal commitment before someone has sent their first typo fix. A DCO (`git commit -s`, certifying the contributor has the right to submit the code) gives enough legal traceability for Apache 2.0 compliance without the chilling effect. This is the model used by the Linux kernel and Docker.
- **No dual-licensing.** The code is Apache 2.0, full stop — no "open source unless you're a competitor" carve-out. Dual-licensing (Apache 2.0 for individuals, commercial license for companies above N employees) is a legitimate model some projects use, but it reintroduces exactly the trust friction this strategy is designed to avoid. Revisit only if Portcullis Cloud is directly undercut by a well-funded hosted competitor (see §9) and the data shows it's actually costing revenue, not just theoretically could.
- **Maintainer model:** start as BDFL (you), with a documented path to a core-maintainer team once there are 3+ contributors with sustained merged PRs — write this down in `GOVERNANCE.md` before it's needed, not after the first disagreement.

---

## 8. Trademark Policy

Apache 2.0 explicitly does **not** grant trademark rights (§6 of the license text) — this is the actual mechanism that lets a project be simultaneously "100% open source" and still protect its brand, and it's worth stating explicitly rather than leaving implicit:

- The **"Portcullis" name and logo are trademarked separately from the code license.**
- Anyone may fork, modify, and redeploy the code under Apache 2.0. They may **not** call their fork "Portcullis," use the logo, or otherwise imply official affiliation or endorsement without permission.
- A hosted competitor is legally free to run the code — they are not free to call it "Portcullis Cloud" or use the gate-glyph mark (§10). This is the same mechanism WordPress, Docker, and Grafana Labs use to keep a project fully open while still protecting the brand that the commercial product is sold under.

---

## 9. Risks and Honest Trade-offs

Stated directly, because a strategy doc that only lists upside isn't a strategy doc:

1. **Nothing stops someone from running "Portcullis" (rebranded) as a competing hosted service.** Apache 2.0 permits it outright. Mitigation is not legal — it's being first, being the most actively maintained, and owning the trademark so a clone can't trade on your name recognition. This is a real, accepted risk, not a solved problem.
2. **Self-hosting may simply be "easy enough" that most technical users never convert to Cloud.** This is the actual Coolify data point worth confronting: the large majority of Coolify's 325,000+ users self-host and never pay. Coolify's business works anyway, on the minority who value not running Postgres/Redis/backups themselves — meaning Portcullis Cloud's total addressable market is smaller than "every user," and the pricing/positioning has to be built around that reality from day one, not discovered painfully later.
3. **No CLA means less legal flexibility later** (e.g., relicensing under something more restrictive if the business model needs to change) — accepted deliberately in exchange for contributor trust now. If this needs to be revisited, it requires either unanimous contributor consent or a rewrite of the affected code, not a unilateral license change.
4. **"Operational excellence" as a moat is genuinely harder to build than a paywall** — it means Cloud actually has to be meaningfully easier than self-hosting, continuously, or the entire monetization thesis collapses. This is a product-execution risk, not a licensing one, and it's the real work.
5. **The competitive gap named in §2 is a timing bet, not a structural one.** Every advantage in that table is copyable by a better-funded competitor faster than a solo project can defend it. The plan only works if the dashboard and self-serve Cloud tier actually ship before that happens — this risk is a scheduling problem as much as a strategy one.

---

## 10. Brand & Design Direction

Full design-token spec lives in `docs/dashboard-architecture.md`; the summary that should inform every future decision:

- **Register:** minimal, dense, fast — built for someone who lives in this dashboard all day, not a marketing page pretending to be software. Terminal-adjacent, not enterprise-SaaS.
- **Palette:** a cold slate-charcoal canvas with a single restrained brass/ironwork accent — a deliberate nod to the gate metaphor in the name, used sparingly (primary actions, focus states) rather than as decoration.
- **Signature element:** a minimal line-art "gate glyph" (vertical lattice bars) used as the product mark, which performs a small raise/lower motion on connection-state and allow/deny events — the one place the brand takes a visual risk; everything else stays quiet.
- **Copy voice:** plain, active, specific — "3 requests denied by RBAC," never "Oops, something went wrong."

---

## 11. Productization Roadmap

- [ ] **Phase 0 (now):** ship self-hosted Portcullis (engine + dashboard) under Apache 2.0. No Cloud yet. Prove the open-source product is good enough to want to run.
- [ ] **Phase 1:** private beta of Portcullis Cloud — see [the phase definition below](#phase-1--private-beta-validate-before-building-billing).
- [ ] **Phase 2:** self-serve Cloud signup, Stripe billing, automated provisioning — see [the phase definition below](#phase-2--self-serve-cloud-signup-billing-automation).
- [ ] **Phase 3:** team/org features on Cloud specifically (SSO for the Cloud control plane, seat management, usage-based billing tiers) — never gated in the open-source code, only relevant because Cloud is multi-tenant and self-host typically isn't.
- [ ] **Phase 4:** revisit this entire document with real usage data — conversion rate, self-host-to-Cloud ratio, support burden — before changing anything about the licensing model — see [the phase definition below](#phase-4--data-backed-strategy-review-the-gate-before-any-licensing-change).

### Phase 1 — Private Beta (validate before building billing)

**Definition of the phase.** 3–10 design partners run on Portcullis Cloud, provisioned by hand. No automation, no Stripe, no self-serve signup. The only question this phase answers — in its sharpest form — is the one posed in [§5](#5-monetization-portcullis-cloud) and named as risk #2 in [§9](#9-risks-and-honest-trade-offs): *is "we'll run Postgres/Redis/backups for you" something people will actually pay for?* This is deliberately a validation phase, not a launch.

**Who the design partners are.** The users most likely to become Cloud customers later: small teams and solo operators running MCP servers in production who self-host today. Recruit from the open-source community (star/fork/self-host signals), not from cold outreach — people who already chose the project are the honest early market. Their job: use it for real work, report what breaks, and answer the price question truthfully.

**What they get, in exchange for feedback.** Free managed hosting for the length of the beta, a direct line to the founder, early access to features, and explicit influence over what Phase 2 builds. The deal is concrete and symmetrical: free hosting, in exchange for candid usage and a real answer to "what would you pay?"

**What "manual provisioning" means here, and why it's a feature, not a gap.** Every tenant is stood up by hand — create the tenant, provision Postgres/Redis, configure backups, hand over credentials. Each manual step is a backlog item for Phase 2 automation; the phase is designed so that the human doing the work is simultaneously writing down what the automation will have to replace. Nobody pays for tooling in Phase 1; the tooling is whatever makes the manual job tolerable for a handful of tenants.

**What gets validated (the exit criteria for Phase 2):**
- **Retention, not signups.** Are partners still using it at 30/60 days, or did they drift back to self-hosting? A beta people quietly abandon fails regardless of what anyone said in the kickoff call.
- **A real price answer.** Before any billing code exists, each partner is asked the direct question — *"if we charged $X/mo, would you stay?"* — and the answer must be a number, not a vibe. This is the cheapest way to learn whether §5's pricing shape is in the right universe, and it's the validation that decides whether Stripe is ever built.
- **Which component is the actual pain.** Is the paid-for thing Postgres, Redis, backups, upgrades, or uptime? The §5 hypothesis is that *managed infrastructure* is the product; Phase 1 should produce evidence of which component actually carries the value, so Phase 2 pricing can lead with it.
- **The ops-cost curve.** Is each tenant a one-time setup cost or per-week maintenance? This decides whether $5–7/mo per server can ever cover support — the margin question §5 is explicitly punting on until real hosting-cost data exists.

**Explicitly out of scope.** Stripe, self-serve signup, tenant provisioning automation, and any multi-tenant scaling work. The discipline is the point: Phase 1 exists to confirm or kill the paid-product hypothesis as cheaply as possible, and building billing infrastructure early is the one way to spend a month proving something nobody wanted.

**Gate to Phase 2.** Automation and billing start only when the answers are "yes": partners still using it at 60 days, a defensible price number on the table, and a known ops-cost curve. If retention or the price answer is weak, the correct move is **not** to build billing anyway — it's to stop, learn why, and decide whether the paid tier changes shape or gets dropped. A failed Phase 1 is a cheap, valuable result; a Phase 1 that ignores its own evidence is the expensive failure.

### Phase 2 — Self-Serve Cloud (signup, billing, automation)

**Definition of the phase.** Turn the Phase 1 validation into an unattended product: anyone signs up, pays with a card, and gets a running gateway without a human in the loop. This is the phase where the positioning claim in [§2](#2-prior-art--positioning) — *"pay for hosting without talking to a salesperson"* — has to become literally true, because until this phase exists, that claim is aspirational. Phase 2 is a launch, not another validation cycle: Phase 1 answered *whether* people will pay; Phase 2 answers *whether they will pay without being asked twice*.

**What "self-serve signup" means here.** A signup flow with zero founder involvement: OAuth/email identity, org creation, and a path to a provisioned gateway in minutes. The operational bar is that the founder stops being the provisioning system — if a new customer still requires a Slack message or a manual database row, that's Phase 1 leaking into Phase 2. Crucially, self-serve signup must work *without* a sales call, which is the whole differentiator against Lunar/MintMCP from the §2 table.

**What "Stripe billing" means here.** Real prices (calibrated to the numbers Phase 1 surfaced, not to the illustrative table in §5), a card on file before value is delivered, proration/upgrades handled by the platform, and invoicing that doesn't require the founder to touch it. This phase also answers the trial question with data: whether a card-before-value flow or a no-card trial converts better. The billing integration is deliberately listed as "not open" code in [§4](#4-whats-actually-not-open) — but the pricing rules it implements are the product's public policy, and the §5 shape stays the reference until real payment data says otherwise.

**What "automated provisioning" means here.** The exact steps the founder wrote down by hand in Phase 1, now scripted: create tenant, provision Postgres/Redis, configure backups, issue credentials, wire the gateway. Reliability bar: a tenant stands up without founder intervention, and a failed provisioning leaves no orphaned resources and a clear retry path. The ops-cost curve from Phase 1 decides what gets automated first — the items that cost the most recurring time win, not the ones that are most technically interesting.

**What gets validated (the success criteria, and the gate to Phase 3):**
- **Time-to-first-server.** Minutes, not days, from signup to a working gateway — this is the single most direct measure of whether self-serve is real.
- **Conversion without intervention.** What fraction of signups reaches a paying state without any founder touch? If it's low, the funnel has a leak that Phase 3's org features won't fix.
- **The support-burden curve.** Does automated provisioning actually drop per-tenant maintenance below what Phase 1 measured, or did the work just move from provisioning to support? This is the margin test §5 punted on.
- **Payment friction vs. churn.** Whether requiring a card before value is a net positive or drives abandonment — with a defensible answer, not a hunch, so §5's pricing shape can be confirmed or corrected.
- **Zero-downtime upgrades.** The "automatic upgrades" promise from §5 has to hold at Phase 2 scale, because it's one of the few things a self-hosted deployment genuinely can't match.

**Explicitly out of scope.** Team/org SSO, seat management, and usage-based billing tiers — those are Phase 3, and only because Cloud is multi-tenant. Horizontal platform scaling for thousands of concurrent tenants. Anything that reintroduces a human into the signup path. Phase 2's job is to make the Phase 1 value proposition *reliable at rest*; it is not yet optimizing scale.

**Gate to Phase 3.** Team/org features start when the self-serve funnel is real — paying signups without founder intervention, sub-founding-team support load, and time-to-first-server measured in minutes. If signups stall at "someone had to help them," Phase 3 is the wrong next investment; the fix is in the Phase 2 funnel, not in more Cloud features.

### Phase 4 — Data-Backed Strategy Review (the gate before any licensing change)

**Definition of the phase.** A review phase, not a feature phase. It exists because §1 commits the project to "no feature gating, ever," then adds the escape hatch: *if that answer ever needs to change, it should happen here, deliberately, with the trade-offs written down — not feature-by-feature in a PR description.* This phase is that "here." Its entire output is a written, evidence-backed verdict on the licensing model in §3 — and in the default case, the verdict is "the model survives," because §1 deliberately sets the bar for change high.

**Why it cannot happen before this point.** The licensing decision is the document's most expensive decision to change and its cheapest to defend with data. Every earlier phase collects that data as a side effect: Phase 1 measures willingness to pay, Phase 2 measures conversion without intervention and the support-burden curve, and Phase 3 (SSO, seat management, usage metering on Cloud) instruments the product so the numbers this phase needs are actually visible — self-host installs reporting opt-in telemetry, Cloud tenants reporting usage, support tickets tagged per tenant. Phase 4 is the first point where there is both a paying population and a meter to count it. Any earlier, the decision would be made on three beta users' vibes; any later, the project could drift for years on an unexamined assumption.

**The three numbers that decide it** (the ones named in the roadmap line):
- **Conversion rate** — what fraction of self-host users actually move to Cloud. This is the direct, quantified test of §9 risk #2 ("self-hosting may simply be easy enough that most technical users never convert"). Coolify's own reported data — 325k+ users, a large majority self-hosting and never paying — is the prior to beat; Portcullis's number just needs to be *known*, not heroic.
- **Self-host-to-Cloud ratio** — the denominator against which every pricing decision in §5 is measured. If Cloud is 1% of users, pricing must be built for a niche; if it's 15%, the §5 shape under-states it. This ratio is the single most direct sanity check on whether the Coolify-model bet is the right bet for this audience at all.
- **Support burden** — per-tenant support cost, because it is the one line item that can make the whole model unprofitable regardless of conversion. §5 punts on this explicitly ("set real numbers once there's a working product and real hosting-cost data"); §2's positioning (self-serve, no sales call) only survives if per-tenant support is a rounding error, not a second salary.

**What gets decided (not what gets built).** The review re-examines the whole document — the §5 price ladder, the §2 positioning claim, the §9 risk register — because every one of those sections contains a number that was written as a guess. Only the licensing model is *gated* on the outcome; the others get corrected as a normal consequence of learning. The verdict on licensing has three legal outcomes:

1. **No change** (the default and the expected result) — conversion is real, support burden is manageable, and the Cloud price ladder covers costs. The "always no" answer in §1 is reaffirmed with numbers behind it.
2. **Price/positioning adjustment within the model** — conversion is real but §5's illustrative prices don't clear the support burden or hosting costs. Prices move; the model (fully open, Cloud sells operations) does not. This is *not* a licensing change and needs no special gate.
3. **License change** — the one case where §1's "always no" is legitimately revisited: conversion is effectively zero *and* support burden is unsustainable *and* §9 risk #1 (a hosted competitor strip-mining the open code) is costing real revenue, not theoretically could. Outcome 3 is the only path that can open the dual-licensing/BSL conversation in §7, and it requires the written trade-offs and community conversation §7 describes — not a unilateral repo edit.

**Explicitly out of scope.** No feature gating in this phase, no partial licenses, no "Pro" tier carved out of the roadmap. A licensing change made here would have to be all-or-nothing, and it would have to survive the same scrutiny §1 already applies: a documented, data-backed, community-aware decision — the opposite of a feature-by-feature drift toward open-core.

**Gate to next.** If the verdict is 1 or 2, §3–§4 do not change and the project continues as-is; the review's only lasting effect is that the numbers it produced stay in this document so the next revisit starts from a known baseline, not from memory. If the verdict is 3, it becomes its own workstream with its own plan — and even then, §4's boundary holds: the code stays open, and what changes is how the *hosted product* is positioned and licensed, never what self-hosting gets.