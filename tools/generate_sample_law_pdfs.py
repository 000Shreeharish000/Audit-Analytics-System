from __future__ import annotations

from pathlib import Path


LETTER_WIDTH = 612
LETTER_HEIGHT = 792
LEFT_MARGIN = 72
TOP_Y = 744
LINE_HEIGHT = 18


def escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(lines: list[str]) -> bytes:
    text_lines = ["BT", "/F1 12 Tf", f"{LEFT_MARGIN} {TOP_Y} Td", f"{LINE_HEIGHT} TL"]
    for index, line in enumerate(lines):
        escaped = escape_pdf_text(line)
        if index == 0:
            text_lines.extend(["/F1 16 Tf", f"({escaped}) Tj", "/F1 12 Tf"])
        else:
            text_lines.extend(["T*", f"({escaped}) Tj"])
    text_lines.append("ET")
    content_stream = "\n".join(text_lines).encode("latin-1", errors="ignore")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            f"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {LETTER_WIDTH} {LETTER_HEIGHT}] "
            f"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n"
        ).encode("ascii"),
        (
            f"4 0 obj\n<< /Length {len(content_stream)} >>\nstream\n".encode("ascii")
            + content_stream
            + b"\nendstream\nendobj\n"
        ),
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]

    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(output))
        output.extend(obj)

    xref_start = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    output.extend(
        (
            "trailer\n"
            f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            "startxref\n"
            f"{xref_start}\n"
            "%%EOF\n"
        ).encode("ascii")
    )
    return bytes(output)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    output_dir = repo_root / "sample-policy-pdfs"
    output_dir.mkdir(parents=True, exist_ok=True)

    documents = {
        "law_1_segregation_of_duties_vendor_governance_2026.pdf": [
            "Sample Law 1: Segregation of Duties and Vendor Governance Regulation, 2026",
            "Section 1. Vendor creation and vendor approval shall be performed by separate employees.",
            "Section 2. An employee who creates a vendor shall not approve, authorize, or release that vendor.",
            "Section 3. High risk vendor onboarding shall require dual authorization and preserved audit evidence.",
            "Section 4. Compliance logs and approval records shall be retained for independent audit review.",
            "Section 5. Any override to maker checker controls must be documented with rationale and approver identity.",
        ],
        "law_2_invoice_threshold_and_payment_governance_2026.pdf": [
            "Sample Law 2: Invoice Threshold and Payment Governance Regulation, 2026",
            "Section 1. Invoices structured to avoid approval thresholds shall receive enhanced compliance review.",
            "Section 2. Payments above the high value threshold shall require two independent approvals.",
            "Section 3. The same employee shall not submit, approve, and release the same payment transaction.",
            "Section 4. Payment release must preserve linked invoice, approval, and counterparty evidence.",
            "Section 5. Compliance teams shall review repeated near threshold invoices for governance bypass behavior.",
        ],
    }

    for filename, lines in documents.items():
        pdf_bytes = build_pdf(lines)
        (output_dir / filename).write_bytes(pdf_bytes)


if __name__ == "__main__":
    main()
