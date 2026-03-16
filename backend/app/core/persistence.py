from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

from app.security.encryption import DataEncryptionService


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _payload_hash(payload: Dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class PersistentStore:
    def __init__(self, db_path: str, encryption: DataEncryptionService) -> None:
        self._db_path = db_path
        self._encryption = encryption
        self._lock = Lock()

        directory = os.path.dirname(db_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path, timeout=30, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL;")
        connection.execute("PRAGMA synchronous=FULL;")
        connection.execute("PRAGMA foreign_keys=ON;")
        connection.execute("PRAGMA temp_store=MEMORY;")
        return connection

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    username TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    failed_attempts INTEGER NOT NULL DEFAULT 0,
                    locked_until TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS datasets (
                    dataset_id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cases (
                    case_id TEXT PRIMARY KEY,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS investigations (
                    case_id TEXT PRIMARY KEY,
                    generated_by TEXT NOT NULL,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    generated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS system_events (
                    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    payload_encrypted TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS company_policies (
                    company_id TEXT PRIMARY KEY,
                    company_name TEXT NOT NULL,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    updated_by TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS policy_versions (
                    company_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    approved_by TEXT,
                    approval_note TEXT,
                    created_at TEXT NOT NULL,
                    published_at TEXT,
                    PRIMARY KEY(company_id, version)
                );

                CREATE TABLE IF NOT EXISTS policy_documents (
                    document_id TEXT PRIMARY KEY,
                    company_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    content_encrypted TEXT NOT NULL,
                    extracted_rules_encrypted TEXT NOT NULL,
                    uploaded_by TEXT NOT NULL,
                    uploaded_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS counterparty_records (
                    company_id TEXT NOT NULL,
                    counterparty_id TEXT NOT NULL,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(company_id, counterparty_id)
                );

                CREATE TABLE IF NOT EXISTS auditor_alerts (
                    alert_id TEXT PRIMARY KEY,
                    company_id TEXT NOT NULL,
                    auditor_id TEXT NOT NULL,
                    case_id TEXT,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS auditor_assignments (
                    company_id TEXT NOT NULL,
                    vendor_id TEXT NOT NULL,
                    payload_encrypted TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    assigned_at TEXT NOT NULL,
                    PRIMARY KEY(company_id, vendor_id)
                );

                CREATE TABLE IF NOT EXISTS case_status_history (
                    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    owner TEXT,
                    note TEXT,
                    actor TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS manual_audits (
                    audit_id TEXT PRIMARY KEY,
                    auditor_id TEXT NOT NULL,
                    vendor_id TEXT NOT NULL,
                    case_ids TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'MEDIUM',
                    notes TEXT NOT NULL DEFAULT '',
                    findings TEXT NOT NULL DEFAULT '[]',
                    recommended_action TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open'
                );

                CREATE TABLE IF NOT EXISTS report_drafts (
                    report_id TEXT PRIMARY KEY,
                    updated_by TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS regulatory_signals (
                    signal_id TEXT PRIMARY KEY,
                    regulator TEXT NOT NULL,
                    circular TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Processed',
                    signal_date TEXT NOT NULL,
                    effective_date TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    full_description TEXT NOT NULL,
                    requirements TEXT NOT NULL DEFAULT '[]',
                    gap TEXT,
                    source_url TEXT NOT NULL,
                    created_by TEXT NOT NULL DEFAULT 'system',
                    created_at TEXT NOT NULL
                );
                """
            )
            self._seed_regulatory_signals()

    def _seed_regulatory_signals(self) -> None:
        """Insert default Indian regulatory signals if none exist yet."""
        with self._lock:
            with self._connect() as conn:
                count = conn.execute("SELECT COUNT(*) FROM regulatory_signals").fetchone()[0]
                if count > 0:
                    return
                seeds = [
                    (
                        "SIG-IFSCA-2024-017",
                        "IFSCA",
                        "IFSCA/2024/GN/REG-017",
                        "AML transaction threshold update",
                        "Processed",
                        "2026-03-12",
                        "2026-04-01",
                        "Updated AML thresholds for GIFT City entities: cash transactions above ₹10 lakh and wire transfers above ₹50 lakh now require enhanced due diligence.",
                        "The IFSCA has revised the Anti-Money Laundering (AML) framework for entities operating in GIFT City IFSC. The amendment aligns thresholds with FATF 2025 recommendations and mandates enhanced customer due diligence (ECDD) for high-value transactions.",
                        json.dumps([
                            "Cash transactions above ₹10 lakh: Enhanced Due Diligence (EDD) mandatory",
                            "Wire transfers above ₹50 lakh: Source of funds declaration required",
                            "Cross-border remittances above USD 1 million: Regulatory reporting within 48 hours",
                            "Record retention: All AML records to be kept for 7 years (up from 5)",
                        ]),
                        None,
                        "https://ifsca.gov.in/Circular",
                        "system",
                        _utc_now(),
                    ),
                    (
                        "SIG-SEBI-2026-01",
                        "SEBI",
                        "SEBI/HO/CFD/2026-01",
                        "Related-party disclosure norms",
                        "Gap detected",
                        "2026-03-09",
                        "2026-04-01",
                        "SEBI has tightened related-party transaction disclosure requirements, lowering materiality thresholds and mandating quarterly disclosures.",
                        "SEBI has tightened the related-party transaction disclosure requirements under Regulation 23 of LODR Regulations 2015. The amendment reduces the materiality threshold requiring prior shareholder approval and mandates quarterly disclosures regardless of transaction size.",
                        json.dumps([
                            "RPT above ₹1,000 crore or 10% of annual consolidated turnover: Prior shareholder approval",
                            "Quarterly RPT disclosure in financial results mandatory, regardless of threshold",
                            "All RPTs to be reviewed by Audit Committee before Board approval",
                            "Arm's length pricing report mandatory for RPTs above ₹500 crore",
                        ]),
                        "Detected 3 transactions via vendor INV-V002 exceeding ₹500 crore threshold without Audit Committee pre-approval on record.",
                        "https://www.sebi.gov.in/legal/circulars",
                        "system",
                        _utc_now(),
                    ),
                    (
                        "SIG-RBI-2026-03",
                        "RBI",
                        "RBI/2026-27/03",
                        "High-value RTGS reporting window",
                        "Processed",
                        "2026-03-05",
                        "2026-03-15",
                        "New two-hour reporting window for high-value RTGS transactions above ₹5 crore to improve payment system oversight.",
                        "The RBI has mandated a two-hour reporting window for RTGS transactions exceeding ₹5 crore, requiring banks and payment aggregators to submit structured data through the RBI's Payment and Settlement System reporting API.",
                        json.dumps([
                            "RTGS transactions above ₹5 crore: Report to RBI within 2-hour window",
                            "Reporting via RBI PSS API in standardised XML format",
                            "Failed RTGS above ₹10 crore: Immediate escalation to RBI within 30 minutes",
                            "Daily reconciliation report mandatory by 23:59 IST",
                        ]),
                        None,
                        "https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx",
                        "system",
                        _utc_now(),
                    ),
                ]
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO regulatory_signals(
                        signal_id, regulator, circular, topic, status,
                        signal_date, effective_date, summary, full_description,
                        requirements, gap, source_url, created_by, created_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    seeds,
                )
                conn.commit()

    def _execute(self, query: str, params: tuple = ()) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.execute(query, params)
                conn.commit()

    def _fetchone(self, query: str, params: tuple = ()) -> Optional[sqlite3.Row]:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(query, params).fetchone()
        return row

    def _fetchall(self, query: str, params: tuple = ()) -> List[sqlite3.Row]:
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(query, params).fetchall()
        return rows

    def upsert_user(self, username: str, password_hash: str, role: str) -> None:
        now = _utc_now()
        self._execute(
            """
            INSERT INTO users(username, password_hash, role, is_active, failed_attempts, locked_until, created_at, updated_at)
            VALUES(?, ?, ?, 1, 0, NULL, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                password_hash=excluded.password_hash,
                role=excluded.role,
                is_active=1,
                updated_at=excluded.updated_at
            """,
            (username, password_hash, role, now, now),
        )

    def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        row = self._fetchone(
            """
            SELECT username, password_hash, role, is_active, failed_attempts, locked_until
            FROM users WHERE username=?
            """,
            (username,),
        )
        if not row:
            return None
        return dict(row)

    def list_users(self) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            "SELECT username, role, is_active, failed_attempts, locked_until FROM users ORDER BY username"
        )
        return [dict(row) for row in rows]

    def record_login_failure(
        self,
        username: str,
        *,
        max_failed_logins: int,
        lockout_minutes: int,
    ) -> Dict[str, Any]:
        user = self.get_user(username)
        if not user:
            return {"exists": False, "locked": False}

        attempts = int(user["failed_attempts"]) + 1
        locked_until = None
        locked = False
        if attempts >= max_failed_logins:
            locked = True
            locked_until = (
                datetime.now(timezone.utc) + timedelta(minutes=lockout_minutes)
            ).isoformat()
            attempts = 0

        self._execute(
            """
            UPDATE users
            SET failed_attempts=?, locked_until=?, updated_at=?
            WHERE username=?
            """,
            (attempts, locked_until, _utc_now(), username),
        )
        return {"exists": True, "locked": locked, "locked_until": locked_until}

    def clear_login_failures(self, username: str) -> None:
        self._execute(
            """
            UPDATE users
            SET failed_attempts=0, locked_until=NULL, updated_at=?
            WHERE username=?
            """,
            (_utc_now(), username),
        )

    def is_user_locked(self, username: str) -> bool:
        user = self.get_user(username)
        if not user:
            return False
        locked_until = user.get("locked_until")
        if not locked_until:
            return False
        try:
            lock_time = datetime.fromisoformat(str(locked_until))
        except ValueError:
            return False
        if lock_time <= datetime.now(timezone.utc):
            self.clear_login_failures(username)
            return False
        return True

    def store_dataset(self, dataset_id: str, payload: Dict[str, Any], source: str, actor: str) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        hash_value = _payload_hash(payload)
        self._execute(
            """
            INSERT OR REPLACE INTO datasets(dataset_id, source, actor, payload_encrypted, payload_hash, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (dataset_id, source, actor, encrypted, hash_value, _utc_now()),
        )

    def latest_dataset(self) -> Optional[Dict[str, Any]]:
        row = self._fetchone(
            """
            SELECT payload_encrypted, payload_hash
            FROM datasets
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        if not row:
            return None
        payload = self._encryption.decrypt_json(row["payload_encrypted"])
        if _payload_hash(payload) != row["payload_hash"]:
            raise ValueError("Dataset integrity verification failed")
        return payload

    def upsert_company_policy(
        self,
        *,
        company_id: str,
        company_name: str,
        payload: Dict[str, Any],
        updated_by: str,
    ) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        hash_value = _payload_hash(payload)
        self._execute(
            """
            INSERT OR REPLACE INTO company_policies(
                company_id, company_name, payload_encrypted, payload_hash, updated_by, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?)
            """,
            (company_id, company_name, encrypted, hash_value, updated_by, _utc_now()),
        )

    def get_company_policy(self, company_id: str) -> Optional[Dict[str, Any]]:
        row = self._fetchone(
            """
            SELECT payload_encrypted, payload_hash
            FROM company_policies
            WHERE company_id=?
            """,
            (company_id,),
        )
        if not row:
            return None
        payload = self._encryption.decrypt_json(row["payload_encrypted"])
        if _payload_hash(payload) != row["payload_hash"]:
            raise ValueError(f"Company policy integrity verification failed: {company_id}")
        return payload

    def list_company_policies(self) -> List[Dict[str, Any]]:
        rows = self._fetchall("SELECT company_id, payload_encrypted, payload_hash FROM company_policies")
        policies = []
        for row in rows:
            payload = self._encryption.decrypt_json(row["payload_encrypted"])
            if _payload_hash(payload) != row["payload_hash"]:
                continue
            policies.append(payload)
        return policies

    def latest_policy_version_number(self, company_id: str) -> int:
        row = self._fetchone(
            "SELECT COALESCE(MAX(version), 0) AS max_version FROM policy_versions WHERE company_id=?",
            (company_id,),
        )
        if not row:
            return 0
        return int(row["max_version"] or 0)

    def store_policy_version(
        self,
        *,
        company_id: str,
        version: int,
        status: str,
        payload: Dict[str, Any],
        created_by: str,
        approved_by: Optional[str] = None,
        approval_note: Optional[str] = None,
        published_at: Optional[str] = None,
    ) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        hash_value = _payload_hash(payload)
        created_at = _utc_now()
        self._execute(
            """
            INSERT OR REPLACE INTO policy_versions(
                company_id, version, status, payload_encrypted, payload_hash,
                created_by, approved_by, approval_note, created_at, published_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company_id,
                version,
                status,
                encrypted,
                hash_value,
                created_by,
                approved_by,
                approval_note,
                created_at,
                published_at,
            ),
        )

    def get_policy_version(self, company_id: str, version: int) -> Optional[Dict[str, Any]]:
        row = self._fetchone(
            """
            SELECT payload_encrypted, payload_hash, status, approved_by, approval_note, created_at, published_at
            FROM policy_versions
            WHERE company_id=? AND version=?
            """,
            (company_id, version),
        )
        if not row:
            return None
        payload = self._encryption.decrypt_json(row["payload_encrypted"])
        if _payload_hash(payload) != row["payload_hash"]:
            raise ValueError(f"Policy version integrity verification failed: {company_id} v{version}")
        payload["status"] = row["status"]
        payload["approved_by"] = row["approved_by"]
        payload["published_at"] = row["published_at"]
        payload["approval_note"] = row["approval_note"]
        payload["version"] = version
        if "updated_at" not in payload:
            payload["updated_at"] = row["created_at"]
        return payload

    def list_policy_versions(self, company_id: str) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT version, status, payload_encrypted, payload_hash, approved_by, approval_note, created_at, published_at
            FROM policy_versions
            WHERE company_id=?
            ORDER BY version DESC
            """,
            (company_id,),
        )
        versions: List[Dict[str, Any]] = []
        for row in rows:
            payload = self._encryption.decrypt_json(row["payload_encrypted"])
            if _payload_hash(payload) != row["payload_hash"]:
                continue
            payload["version"] = int(row["version"])
            payload["status"] = row["status"]
            payload["approved_by"] = row["approved_by"]
            payload["approval_note"] = row["approval_note"]
            payload["published_at"] = row["published_at"]
            if "updated_at" not in payload:
                payload["updated_at"] = row["created_at"]
            versions.append(payload)
        return versions

    def publish_policy_version(
        self,
        *,
        company_id: str,
        version: int,
        approved_by: str,
        approval_note: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        payload = self.get_policy_version(company_id, version)
        if not payload:
            return None
        published_at = _utc_now()
        payload["status"] = "published"
        payload["approved_by"] = approved_by
        payload["published_at"] = published_at
        payload["updated_at"] = published_at

        self.store_policy_version(
            company_id=company_id,
            version=version,
            status="published",
            payload=payload,
            created_by=approved_by,
            approved_by=approved_by,
            approval_note=approval_note,
            published_at=published_at,
        )
        self.upsert_company_policy(
            company_id=company_id,
            company_name=payload.get("company_name", company_id),
            payload=payload,
            updated_by=approved_by,
        )
        return payload

    def store_policy_document(
        self,
        *,
        document_id: str,
        company_id: str,
        source: str,
        filename: str,
        content: Dict[str, Any],
        extracted_rules: Dict[str, Any],
        uploaded_by: str,
    ) -> None:
        content_encrypted = self._encryption.encrypt_json(content)
        rules_encrypted = self._encryption.encrypt_json(extracted_rules)
        self._execute(
            """
            INSERT OR REPLACE INTO policy_documents(
                document_id, company_id, source, filename,
                content_encrypted, extracted_rules_encrypted, uploaded_by, uploaded_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                company_id,
                source,
                filename,
                content_encrypted,
                rules_encrypted,
                uploaded_by,
                _utc_now(),
            ),
        )

    def recent_policy_documents(self, company_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT document_id, source, filename, content_encrypted, extracted_rules_encrypted, uploaded_by, uploaded_at
            FROM policy_documents
            WHERE company_id=?
            ORDER BY uploaded_at DESC
            LIMIT ?
            """,
            (company_id, limit),
        )
        documents = []
        for row in rows:
            documents.append(
                {
                    "document_id": row["document_id"],
                    "source": row["source"],
                    "filename": row["filename"],
                    "content": self._encryption.decrypt_json(row["content_encrypted"]),
                    "extracted_rules": self._encryption.decrypt_json(row["extracted_rules_encrypted"]),
                    "uploaded_by": row["uploaded_by"],
                    "uploaded_at": row["uploaded_at"],
                }
            )
        return documents

    def clear_cases(self) -> None:
        self._execute("DELETE FROM cases")
        self._execute("DELETE FROM investigations")
        self._execute("DELETE FROM case_status_history")

    def store_case(self, case_id: str, payload: Dict[str, Any]) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        hash_value = _payload_hash(payload)
        self._execute(
            """
            INSERT OR REPLACE INTO cases(case_id, payload_encrypted, payload_hash, created_at)
            VALUES(?, ?, ?, ?)
            """,
            (case_id, encrypted, hash_value, _utc_now()),
        )

    def load_cases(self) -> List[Dict[str, Any]]:
        rows = self._fetchall("SELECT case_id, payload_encrypted, payload_hash FROM cases ORDER BY case_id")
        cases: List[Dict[str, Any]] = []
        for row in rows:
            payload = self._encryption.decrypt_json(row["payload_encrypted"])
            if _payload_hash(payload) != row["payload_hash"]:
                raise ValueError(f"Case integrity verification failed: {row['case_id']}")
            cases.append(payload)
        return cases

    def append_case_status_event(
        self,
        *,
        case_id: str,
        status: str,
        owner: Optional[str],
        note: Optional[str],
        actor: str,
    ) -> None:
        self._execute(
            """
            INSERT INTO case_status_history(case_id, status, owner, note, actor, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (case_id, status, owner, note, actor, _utc_now()),
        )

    def list_case_status_events(self, case_id: str) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT case_id, status, owner, note, actor, created_at
            FROM case_status_history
            WHERE case_id=?
            ORDER BY event_id ASC
            """,
            (case_id,),
        )
        return [dict(row) for row in rows]

    def store_investigation(self, case_id: str, report: Dict[str, Any], generated_by: str) -> None:
        encrypted = self._encryption.encrypt_json(report)
        hash_value = _payload_hash(report)
        self._execute(
            """
            INSERT OR REPLACE INTO investigations(case_id, generated_by, payload_encrypted, payload_hash, generated_at)
            VALUES(?, ?, ?, ?, ?)
            """,
            (case_id, generated_by, encrypted, hash_value, _utc_now()),
        )

    def load_investigation(self, case_id: str) -> Optional[Dict[str, Any]]:
        row = self._fetchone(
            "SELECT payload_encrypted, payload_hash FROM investigations WHERE case_id=?",
            (case_id,),
        )
        if not row:
            return None
        payload = self._encryption.decrypt_json(row["payload_encrypted"])
        if _payload_hash(payload) != row["payload_hash"]:
            raise ValueError(f"Investigation integrity verification failed: {case_id}")
        return payload

    def load_investigations(self) -> List[Dict[str, Any]]:
        rows = self._fetchall("SELECT payload_encrypted, payload_hash FROM investigations")
        reports: List[Dict[str, Any]] = []
        for row in rows:
            payload = self._encryption.decrypt_json(row["payload_encrypted"])
            if _payload_hash(payload) != row["payload_hash"]:
                raise ValueError("Investigation integrity verification failed")
            reports.append(payload)
        return reports

    def upsert_counterparty_record(
        self,
        *,
        company_id: str,
        counterparty_id: str,
        payload: Dict[str, Any],
    ) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        hash_value = _payload_hash(payload)
        self._execute(
            """
            INSERT OR REPLACE INTO counterparty_records(
                company_id, counterparty_id, payload_encrypted, payload_hash, created_at
            ) VALUES(?, ?, ?, ?, ?)
            """,
            (company_id, counterparty_id, encrypted, hash_value, _utc_now()),
        )

    def list_counterparty_records(self, company_id: str) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT payload_encrypted, payload_hash
            FROM counterparty_records
            WHERE company_id=?
            """,
            (company_id,),
        )
        records: List[Dict[str, Any]] = []
        for row in rows:
            payload = self._encryption.decrypt_json(row["payload_encrypted"])
            if _payload_hash(payload) != row["payload_hash"]:
                continue
            records.append(payload)
        return records

    def store_auditor_alert(self, alert_id: str, company_id: str, auditor_id: str, case_id: Optional[str], payload: Dict[str, Any]) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        hash_value = _payload_hash(payload)
        self._execute(
            """
            INSERT OR REPLACE INTO auditor_alerts(
                alert_id, company_id, auditor_id, case_id, payload_encrypted, payload_hash, created_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (alert_id, company_id, auditor_id, case_id, encrypted, hash_value, _utc_now()),
        )

    def list_auditor_alerts(self, company_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if company_id:
            rows = self._fetchall(
                """
                SELECT payload_encrypted, payload_hash
                FROM auditor_alerts
                WHERE company_id=?
                ORDER BY created_at DESC
                """,
                (company_id,),
            )
        else:
            rows = self._fetchall(
                """
                SELECT payload_encrypted, payload_hash
                FROM auditor_alerts
                ORDER BY created_at DESC
                """
            )
        alerts: List[Dict[str, Any]] = []
        for row in rows:
            payload = self._encryption.decrypt_json(row["payload_encrypted"])
            if _payload_hash(payload) != row["payload_hash"]:
                continue
            alerts.append(payload)
        return alerts

    def clear_auditor_alerts(self, company_id: str) -> None:
        self._execute("DELETE FROM auditor_alerts WHERE company_id=?", (company_id,))

    def store_auditor_assignment(self, company_id: str, vendor_id: str, payload: Dict[str, Any]) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        hash_value = _payload_hash(payload)
        self._execute(
            """
            INSERT OR REPLACE INTO auditor_assignments(
                company_id, vendor_id, payload_encrypted, payload_hash, assigned_at
            ) VALUES(?, ?, ?, ?, ?)
            """,
            (company_id, vendor_id, encrypted, hash_value, _utc_now()),
        )

    def list_auditor_assignments(self, company_id: str) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT payload_encrypted, payload_hash
            FROM auditor_assignments
            WHERE company_id=?
            ORDER BY assigned_at DESC
            """,
            (company_id,),
        )
        assignments = []
        for row in rows:
            payload = self._encryption.decrypt_json(row["payload_encrypted"])
            if _payload_hash(payload) != row["payload_hash"]:
                continue
            assignments.append(payload)
        return assignments

    def store_event(self, event_type: str, actor: str, payload: Dict[str, Any]) -> None:
        encrypted = self._encryption.encrypt_json(payload)
        self._execute(
            """
            INSERT INTO system_events(event_type, actor, payload_encrypted, timestamp)
            VALUES(?, ?, ?, ?)
            """,
            (event_type, actor, encrypted, _utc_now()),
        )

    def recent_events(self, limit: int = 200) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT event_type, actor, payload_encrypted, timestamp
            FROM system_events
            ORDER BY event_id DESC
            LIMIT ?
            """,
            (limit,),
        )
        output: List[Dict[str, Any]] = []
        for row in rows:
            output.append(
                {
                    "event_type": row["event_type"],
                    "actor": row["actor"],
                    "payload": self._encryption.decrypt_json(row["payload_encrypted"]),
                    "timestamp": row["timestamp"],
                }
            )
        return output

    def counts(self) -> Dict[str, int]:
        with self._lock:
            with self._connect() as conn:
                users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                datasets = conn.execute("SELECT COUNT(*) FROM datasets").fetchone()[0]
                cases = conn.execute("SELECT COUNT(*) FROM cases").fetchone()[0]
                investigations = conn.execute("SELECT COUNT(*) FROM investigations").fetchone()[0]
                events = conn.execute("SELECT COUNT(*) FROM system_events").fetchone()[0]
                policies = conn.execute("SELECT COUNT(*) FROM company_policies").fetchone()[0]
                policy_versions = conn.execute("SELECT COUNT(*) FROM policy_versions").fetchone()[0]
                policy_documents = conn.execute("SELECT COUNT(*) FROM policy_documents").fetchone()[0]
                counterparties = conn.execute("SELECT COUNT(*) FROM counterparty_records").fetchone()[0]
                alerts = conn.execute("SELECT COUNT(*) FROM auditor_alerts").fetchone()[0]
                assignments = conn.execute("SELECT COUNT(*) FROM auditor_assignments").fetchone()[0]
                case_status_events = conn.execute("SELECT COUNT(*) FROM case_status_history").fetchone()[0]
                manual_audits = conn.execute("SELECT COUNT(*) FROM manual_audits").fetchone()[0]
                report_drafts = conn.execute("SELECT COUNT(*) FROM report_drafts").fetchone()[0]
                regulatory_signals = conn.execute("SELECT COUNT(*) FROM regulatory_signals").fetchone()[0]
        return {
            "users": int(users),
            "datasets": int(datasets),
            "cases": int(cases),
            "investigations": int(investigations),
            "events": int(events),
            "company_policies": int(policies),
            "policy_versions": int(policy_versions),
            "policy_documents": int(policy_documents),
            "counterparties": int(counterparties),
            "auditor_alerts": int(alerts),
            "auditor_assignments": int(assignments),
            "case_status_events": int(case_status_events),
            "manual_audits": int(manual_audits),
            "report_drafts": int(report_drafts),
            "regulatory_signals": int(regulatory_signals),
        }

    def upsert_manual_audit(self, record: Dict[str, Any]) -> None:
        import json as _json
        self._execute(
            """
            INSERT OR REPLACE INTO manual_audits(
                audit_id, auditor_id, vendor_id, case_ids, severity,
                notes, findings, recommended_action, created_at, status
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["audit_id"],
                record["auditor_id"],
                record["vendor_id"],
                _json.dumps(record.get("case_ids", [])),
                record.get("severity", "MEDIUM"),
                record.get("notes", ""),
                _json.dumps(record.get("findings", [])),
                record.get("recommended_action", ""),
                record.get("created_at", _utc_now()),
                record.get("status", "open"),
            ),
        )

    def list_manual_audits(
        self,
        auditor_id: Optional[str] = None,
        vendor_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        import json as _json
        if auditor_id:
            rows = self._fetchall(
                "SELECT * FROM manual_audits WHERE auditor_id=? ORDER BY created_at DESC",
                (auditor_id,),
            )
        elif vendor_id:
            rows = self._fetchall(
                "SELECT * FROM manual_audits WHERE vendor_id=? ORDER BY created_at DESC",
                (vendor_id,),
            )
        else:
            rows = self._fetchall(
                "SELECT * FROM manual_audits ORDER BY created_at DESC"
            )
        results = []
        for row in rows:
            d = dict(row)
            try:
                d["case_ids"] = _json.loads(d.get("case_ids", "[]"))
            except Exception:
                d["case_ids"] = []
            try:
                d["findings"] = _json.loads(d.get("findings", "[]"))
            except Exception:
                d["findings"] = []
            results.append(d)
        return results

    def upsert_report_draft(self, record: Dict[str, Any]) -> None:
        self._execute(
            """
            INSERT OR REPLACE INTO report_drafts(report_id, updated_by, content, updated_at)
            VALUES(?, ?, ?, ?)
            """,
            (
                record.get("report_id", "auditor_report_draft"),
                record["updated_by"],
                record.get("content", ""),
                record.get("updated_at", _utc_now()),
            ),
        )

    def get_report_draft(self, report_id: str = "auditor_report_draft") -> Optional[Dict[str, Any]]:
        row = self._fetchone("SELECT * FROM report_drafts WHERE report_id=?", (report_id,))
        return dict(row) if row else None

    def list_regulatory_signals(self) -> List[Dict[str, Any]]:
        rows = self._fetchall(
            "SELECT * FROM regulatory_signals ORDER BY signal_date DESC, created_at DESC"
        )
        results = []
        for row in rows:
            d = dict(row)
            try:
                d["requirements"] = json.loads(d.get("requirements", "[]"))
            except Exception:
                d["requirements"] = []
            results.append(d)
        return results

    def save_regulatory_signal(self, signal: Dict[str, Any]) -> None:
        self._execute(
            """
            INSERT OR REPLACE INTO regulatory_signals(
                signal_id, regulator, circular, topic, status,
                signal_date, effective_date, summary, full_description,
                requirements, gap, source_url, created_by, created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                signal["signal_id"],
                signal["regulator"],
                signal["circular"],
                signal["topic"],
                signal.get("status", "Processed"),
                signal["signal_date"],
                signal["effective_date"],
                signal["summary"],
                signal["full_description"],
                json.dumps(signal.get("requirements", [])),
                signal.get("gap"),
                signal["source_url"],
                signal.get("created_by", "system"),
                signal.get("created_at", _utc_now()),
            ),
        )

    @property
    def database_path(self) -> str:
        return self._db_path
