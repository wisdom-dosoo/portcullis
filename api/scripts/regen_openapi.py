"""Regenerate the checked-in OpenAPI snapshot from the live FastAPI app.

Usage:
  cd api && python scripts/regen_openapi.py [--check]

--check exits non-zero with a diff summary when the snapshot is stale (CI).
Otherwise writes openapi.json (+ web/openapi.json copy for orval).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_API = Path(__file__).resolve().parents[1]
WEB_SPEC = REPO_API.parent / "web" / "openapi.json"
SPEC = REPO_API / "openapi.json"


def build_spec() -> dict:
    os.environ.setdefault("API_KEY_PEPPER", "test-only-pepper-for-openapi-snapshot")
    sys.path.insert(0, str(REPO_API))
    from app.main import create_app

    return create_app().openapi()


def main() -> int:
    check_only = "--check" in sys.argv[1:]
    live = build_spec()
    rendered = json.dumps(live, indent=2, sort_keys=True) + "\n"
    if check_only:
        if not SPEC.exists():
            print("missing api/openapi.json — run `make openapi`")
            return 1
        current = SPEC.read_text(encoding="utf-8")
        if current != rendered:
            print("openapi.json is stale — run `make openapi` and commit the result")
            return 1
        print("openapi.json is current")
        return 0
    SPEC.write_text(rendered, encoding="utf-8")
    try:
        WEB_SPEC.write_text(rendered, encoding="utf-8")
        print(f"wrote {SPEC} and {WEB_SPEC}")
    except OSError as exc:
        print(f"wrote {SPEC} (web copy skipped: {exc})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
