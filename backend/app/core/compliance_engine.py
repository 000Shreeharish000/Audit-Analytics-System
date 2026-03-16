from __future__ import annotations

import csv
import io
import json
import re
import urllib.error
import urllib.request
import zipfile
import zlib
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import uuid4

from app.config import Settings
from app.core.model_governor import ModelGovernor
from app.models.decision import CompanyPolicyRule


class ComplianceEngine:
    def __init__(self, settings: Settings, model_governor: ModelGovernor, audit_logger) -> None:  # type: ignore[no-untyped-def]
        self.settings = settings
        self.model_governor = model_governor
        self.audit_logger = audit_logger

    def extract_text(self, filename: str, content: bytes) -> str:
        name = filename.lower()
        if name.endswith(".txt") or name.endswith(".md"):
            return content.decode("utf-8", errors="ignore")
        if name.endswith(".json"):
            try:
                payload = json.loads(content.decode("utf-8", errors="ignore"))
                return json.dumps(payload, indent=2, sort_keys=True)
            except json.JSONDecodeError:
                return content.decode("utf-8", errors="ignore")
        if name.endswith(".csv"):
            reader = csv.reader(io.StringIO(content.decode("utf-8", errors="ignore")))
            return "\n".join(", ".join(row) for row in reader)
        if name.endswith(".docx"):
            return self._extract_docx_text(content)
        if name.endswith(".pdf"):
            return self._extract_pdf_text(content)
        return content.decode("utf-8", errors="ignore")

    def _extract_docx_text(self, content: bytes) -> str:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
        except (KeyError, zipfile.BadZipFile):
            return ""
        text = re.sub(r"<[^>]+>", " ", xml)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _extract_pdf_text(self, content: bytes) -> str:
        chunks: List[str] = []
        for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", content, flags=re.DOTALL):
            stream = match.group(1)
            chunks.extend(self._extract_pdf_text_chunks(stream))
            try:
                chunks.extend(self._extract_pdf_text_chunks(zlib.decompress(stream)))
            except zlib.error:
                continue
        if not chunks:
            chunks.extend(self._extract_pdf_text_chunks(content))
        text = "\n".join(chunk for chunk in chunks if chunk)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{2,}", "\n", text)
        return text.strip()

    def _segment_policy_text(self, text: str) -> List[str]:
        segments = [
            re.sub(r"\s+", " ", line).strip(" -\t")
            for line in re.split(r"[\n\r]+", text)
            if line.strip()
        ]
        if len(segments) > 1:
            return segments

        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized:
            return []

        sentence_splits = re.split(
            r"(?<=[.!?])\s+(?=(?:section|clause|article|rule)\b|\d+\.)|(?<=[.!?])\s+",
            normalized,
            flags=re.IGNORECASE,
        )
        return [segment.strip(" -\t") for segment in sentence_splits if segment.strip()]

    def _extract_pdf_text_chunks(self, blob: bytes) -> List[str]:
        decoded = blob.decode("latin-1", errors="ignore")
        chunks: List[str] = []
        for token in re.findall(r"\(([^()]*(?:\\.[^()]*)*)\)", decoded):
            normalized = self._normalize_pdf_text(token)
            if normalized:
                chunks.append(normalized)
        for token in re.findall(r"<([0-9A-Fa-f]{8,})>", decoded):
            if len(token) % 2 != 0:
                continue
            try:
                raw = bytes.fromhex(token)
            except ValueError:
                continue
            for encoding in ("utf-16-be", "utf-8", "latin-1"):
                try:
                    normalized = re.sub(r"\s+", " ", raw.decode(encoding, errors="ignore")).strip()
                except Exception:
                    continue
                if normalized and any(ch.isalpha() for ch in normalized):
                    chunks.append(normalized)
                    break
        return chunks

    def _normalize_pdf_text(self, value: str) -> str:
        def replace_escape(match: re.Match[str]) -> str:
            token = match.group(0)
            simple = {
                r"\n": " ",
                r"\r": " ",
                r"\t": " ",
                r"\b": "",
                r"\f": "",
                r"\(": "(",
                r"\)": ")",
                r"\\": "\\",
            }
            if token in simple:
                return simple[token]
            if re.fullmatch(r"\\[0-7]{1,3}", token):
                return chr(int(token[1:], 8))
            return token[1:]

        normalized = re.sub(r"\\[nrtbf()\\]|\\[0-7]{1,3}", replace_escape, value)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if len(normalized) < 4 or not any(ch.isalpha() for ch in normalized):
            return ""
        return normalized

    def parse_rules_from_text(
        self,
        *,
        source: str,
        text: str,
        prefix: str,
    ) -> List[CompanyPolicyRule]:
        lines = self._segment_policy_text(text)
        candidate_lines = []
        for line in lines:
            low = line.lower()
            if any(token in low for token in ["must", "shall", "required", "prohibited", "not allowed", "compliance"]):
                candidate_lines.append(line)
        if not candidate_lines:
            candidate_lines = lines[:8]

        rules = []
        for idx, line in enumerate(candidate_lines[:25], start=1):
            rules.append(
                CompanyPolicyRule(
                    rule_id=f"{prefix}_{idx:03d}",
                    title=f"{source.capitalize()} policy rule {idx}",
                    source=source,  # type: ignore[arg-type]
                    severity=0.7 if source != "government" else 0.8,
                    content=line[:1200],
                    effective_from=datetime.now(timezone.utc),
                )
            )
        return rules

    def ai_government_enrichment(self, text: str) -> List[str]:
        if not self.model_governor.external_enabled():
            return []

        payload = self.model_governor.sanitize_for_external({"government_text": text[:5000]})
        prompt = (
            "Extract top compliance obligations for financial audit governance. "
            "Return JSON array of concise obligations. Text: "
            + payload["sanitized_context"]
        )
        body = json.dumps(
            {
                "model": self.settings.external_ai_models[0],
                "messages": [
                    {"role": "system", "content": "You are a compliance analyst."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 250,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            self.settings.external_ai_base_url.rstrip("/") + "/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.settings.external_ai_api_key}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(  # nosec B310
                request,
                timeout=self.settings.external_ai_timeout_seconds,
            ) as response:
                raw = response.read().decode("utf-8")
            parsed = json.loads(raw)
            content = str(parsed["choices"][0]["message"]["content"]).strip()
            extracted = re.findall(r"-\s*(.+)", content)
            if extracted:
                return [item.strip()[:400] for item in extracted[:12]]
            return [line.strip() for line in content.split("\n") if line.strip()][:12]
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, KeyError, IndexError) as exc:
            self.audit_logger.log(
                "gov_rule_enrichment_failed",
                actor="system",
                details={"error": str(exc)},
            )
            return []

    def build_document_record(
        self,
        *,
        company_id: str,
        source: str,
        filename: str,
        text: str,
        extracted_rules: List[CompanyPolicyRule],
    ) -> Dict[str, Any]:
        return {
            "document_id": str(uuid4()),
            "company_id": company_id,
            "source": source,
            "filename": filename,
            "content": {"text": text[:120000]},
            "rules": [rule.model_dump(mode="json") for rule in extracted_rules],
        }
