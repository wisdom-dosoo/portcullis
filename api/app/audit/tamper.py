"""SOC 2 compliant audit log with tamper-evident Merkle tree hash chaining."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select

from app.models.orm import AuditLog
from app.repositories.audit import AuditRepository

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class MerkleNode:
    """A node in the Merkle tree."""

    hash: str
    left: MerkleNode | None = None
    right: MerkleNode | None = None
    data: Any = None
    index: int = -1


@dataclass
class AuditChainEntry:
    """A single entry in the tamper-evident audit chain."""

    index: int
    audit_id: UUID
    timestamp: datetime
    prev_hash: str
    current_hash: str
    merkle_root: str
    payload: dict[str, Any]


class MerkleTree:
    """Merkle tree for audit log integrity verification."""

    @staticmethod
    def hash_data(data: bytes) -> str:
        """Compute SHA-256 hash of data."""
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def hash_pair(left: str, right: str) -> str:
        """Hash two child hashes together."""
        return MerkleTree.hash_data((left + right).encode())

    @classmethod
    def build_leaves(cls, entries: list[AuditChainEntry]) -> list[MerkleNode]:
        """Build leaf nodes from audit entries."""
        leaves = []
        for i, entry in enumerate(entries):
            payload_bytes = json.dumps(entry.payload, sort_keys=True).encode()
            leaf_hash = cls.hash_data(payload_bytes)
            leaves.append(MerkleNode(hash=leaf_hash, data=entry, index=i))
        return leaves

    @classmethod
    def build_tree(cls, leaves: list[MerkleNode]) -> MerkleNode:
        """Build Merkle tree from leaves, return root."""
        if not leaves:
            return MerkleNode(hash=cls.hash_data(b"empty"))

        current_level = leaves
        while len(current_level) > 1:
            next_level = []
            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i + 1] if i + 1 < len(current_level) else left
                parent_hash = cls.hash_pair(left.hash, right.hash)
                parent = MerkleNode(hash=parent_hash, left=left, right=right)
                next_level.append(parent)
            current_level = next_level
        return current_level[0]

    @classmethod
    def get_root_hash(cls, entries: list[AuditChainEntry]) -> str:
        """Compute Merkle root for a list of entries."""
        leaves = cls.build_leaves(entries)
        root = cls.build_tree(leaves)
        return root.hash

    @classmethod
    def get_proof(cls, entries: list[AuditChainEntry], index: int) -> list[dict]:
        """Get Merkle proof for an entry at index."""
        if not entries or index >= len(entries):
            return []

        leaves = cls.build_leaves(entries)
        proof = []
        target_index = index

        current_level = leaves
        while len(current_level) > 1:
            next_level = []
            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i + 1] if i + 1 < len(current_level) else left

                # If our target is in this pair, record the sibling
                if target_index == i or target_index == i + 1:
                    sibling = right if target_index == i else left
                    proof.append(
                        {
                            "hash": sibling.hash,
                            "position": "right" if target_index == i else "left",
                        }
                    )

                parent_hash = MerkleTree.hash_pair(left.hash, right.hash)
                parent = MerkleNode(hash=parent_hash, left=left, right=right)
                next_level.append(parent)

            current_level = next_level
            target_index = target_index // 2

        return proof

    @classmethod
    def verify_proof(cls, leaf_hash: str, proof: list[dict], root_hash: str) -> bool:
        """Verify a Merkle proof."""
        current_hash = leaf_hash
        for step in proof:
            sibling_hash = step["hash"]
            if step["position"] == "left":
                current_hash = cls.hash_pair(sibling_hash, current_hash)
            else:
                current_hash = cls.hash_pair(current_hash, sibling_hash)
        return current_hash == root_hash


class TamperEvidentAuditLog:
    """Tamper-evident audit log with hash chaining and Merkle trees."""

    def __init__(self, session_factory):
        self._session_factory = session_factory
        self._chain_key = "audit:chain:head"  # Redis key for chain head
        self._merkle_interval = 100  # Rebuild Merkle tree every N entries

    async def append(self, audit_log: AuditLog) -> str:
        """Append an audit log entry to the tamper-evident chain.

        P1: legacy global-chain helper is deprecated — writes go through
        ``AuditRepository.create`` (per-tenant advisory-locked hash chain).
        This method now only ensures ``entry_hash`` exists and returns it.
        """
        if audit_log.entry_hash:
            return audit_log.entry_hash
        # Fallback: compute linkage from tenant head without extra writes.
        async with self._session_factory() as session:
            repo = AuditRepository(session)
            tenant_id = audit_log.tenant_id
            if tenant_id is None:
                return ""
            last = await repo.get_last_entry(tenant_id)
            prev = last.entry_hash if last else None
            from app.repositories.audit import _compute_entry_hash

            created_iso = (
                audit_log.created_at.isoformat()
                if audit_log.created_at
                else datetime.now(UTC).isoformat()
            )
            return _compute_entry_hash(
                prev_hash=prev,
                tenant_id=tenant_id,
                subject_id=audit_log.subject_id,
                event_type=audit_log.event_type,
                outcome=audit_log.outcome,
                server_slug=audit_log.server_slug,
                tool_name=audit_log.tool_name,
                detail=audit_log.detail,
                created_at_iso=created_iso,
            )

    async def verify_chain(
        self, tenant_id: UUID, from_index: int = 0, to_index: int | None = None
    ) -> dict:
        """Verify the integrity of the audit chain (P1: tenant-scoped).

        Delegates to ``AuditRepository.verify_chain`` (strict hash + linkage).
        """
        async with self._session_factory() as session:
            repo = AuditRepository(session)
            entries = await repo.get_chain_entries(tenant_id, from_index, to_index)

        if not entries:
            return {"valid": True, "message": "Chain is empty"}

        valid, error = await repo.verify_chain(tenant_id)
        if not valid:
            return {"valid": False, "error": error}
        return {
            "valid": True,
            "entries_verified": len(entries),
            "head_hash": entries[-1].entry_hash if entries else None,
        }

    async def get_merkle_proof(self, audit_id: UUID, tenant_id: UUID) -> dict | None:
        """Get Merkle proof for a specific audit entry (P1: tenant-scoped)."""
        async with self._session_factory() as session:
            repo = AuditRepository(session)
            entry = await repo.get_by_id(audit_id, tenant_id)
            if not entry:
                return None

            # Get surrounding entries for Merkle tree
            chain_index = entry.detail.get("chain", {}).get("chain_index", 0)
            start = max(0, chain_index - 50)
            entries = await repo.get_chain_entries(tenant_id, start, chain_index + 50)

            if not entries:
                return None

            chain_entries = []
            for e in entries:
                chain = e.detail.get("chain", {})
                payload = {k: v for k, v in e.__dict__.items() if k != "detail"}
                chain_entries.append(
                    AuditChainEntry(
                        index=chain.get("chain_index", 0),
                        audit_id=e.id,
                        timestamp=e.created_at,
                        prev_hash=chain.get("prev_hash", ""),
                        current_hash=chain.get("current_hash", ""),
                        merkle_root="",  # Will be computed
                        payload=payload,
                    )
                )

            merkle_root = MerkleTree.get_root_hash(chain_entries)
            target_idx = chain_index - start
            proof = MerkleTree.get_proof(chain_entries, target_idx)

            return {
                "audit_id": str(audit_id),
                "merkle_root": merkle_root,
                "leaf_hash": chain_entries[target_idx].hash,
                "proof": proof,
                "index": chain_index,
            }

    async def verify_merkle_proof(self, proof_data: dict) -> bool:
        """Verify a Merkle proof."""
        return MerkleTree.verify_proof(
            proof_data["leaf_hash"],
            proof_data["proof"],
            proof_data["merkle_root"],
        )


class AuditRetentionPolicy:
    """Manages audit log retention and archival."""

    def __init__(self, session_factory):
        self._session_factory = session_factory

    async def archive_old_entries(self, retention_days: int = 2555) -> int:
        """Archive entries older than retention_days (default 7 years for SOC 2).

        Returns number of entries archived.
        """
        from app.models.orm import AuditLog

        cutoff = datetime.now(UTC) - timedelta(days=retention_days)

        async with self._session_factory() as session:
            # First, get entries to archive
            result = await session.execute(
                select(AuditLog).where(AuditLog.created_at < cutoff).limit(10000)
            )
            entries = list(result.scalars().all())

            if not entries:
                return 0

            # In production, would write to cold storage (S3, Glacier)
            # For now, just mark as archived
            for entry in entries:
                entry.detail = {
                    **(entry.detail or {}),
                    "archived": True,
                    "archived_at": datetime.now(UTC).isoformat(),
                }

            await session.commit()

            logger.info("audit.archived", count=len(entries), cutoff=cutoff.isoformat())
            return len(entries)

    async def purge_expired_entries(self, max_age_days: int = 3650) -> int:
        """Permanently delete entries older than max_age_days (10 years default)."""
        cutoff = datetime.now(UTC) - timedelta(days=max_age_days)

        async with self._session_factory() as session:
            from sqlalchemy import delete

            from app.models.orm import AuditLog

            result = await session.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))
            await session.commit()

            logger.info("audit.purged", count=result.rowcount, cutoff=cutoff.isoformat())
            return result.rowcount
