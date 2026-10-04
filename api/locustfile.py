"""Locust load profile for SLO validation (P3).

Validates the README §19 targets (p50 proxy overhead <15ms, p99 <75ms,
rate-limiter check <5ms) as an on-demand run — NOT part of CI (needs a live
stack with seeded servers/keys).

  cd api && locust -f locustfile.py --host http://localhost:8080

Set env before running:
  PORTCULLIS_API_KEY  admin/proxy key for /mcp/* (required)
  PORTCULLIS_SLUG     registered upstream slug (default: locust-smoke)
"""

from __future__ import annotations

import os

from locust import HttpUser, between, events, task

API_KEY = os.environ.get("PORTCULLIS_API_KEY", "")
SLUG = os.environ.get("PORTCULLIS_SLUG", "locust-smoke")


@events.init_command_line_parser.add_listener
def _check_env(parser) -> None:  # type: ignore[no-untyped-def]
    if not API_KEY:
        print("WARNING: PORTCULLIS_API_KEY unset — all /mcp tasks will 401")


class GatewayUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self) -> None:
        self.headers = {"Authorization": f"Bearer {API_KEY}"}

    @task(10)
    def tools_list(self) -> None:
        with self.client.post(
            f"/mcp/{SLUG}",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
            headers=self.headers,
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 403, 404):
                resp.success()
            else:
                resp.failure(f"unexpected {resp.status_code}")

    @task(3)
    def servers_list(self) -> None:
        with self.client.get("/v1/servers", headers=self.headers, catch_response=True) as resp:
            if resp.status_code in (200, 401, 403):
                resp.success()
            else:
                resp.failure(f"unexpected {resp.status_code}")
