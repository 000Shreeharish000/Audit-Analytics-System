from __future__ import annotations

from collections import Counter
from typing import Iterable, List

from fastapi import HTTPException, status

from app.models.decision import DatasetPayload


def _find_duplicates(values: Iterable[str]) -> List[str]:
    counts = Counter(values)
    return [value for value, count in counts.items() if count > 1]


class AnomalyGuard:
    def validate_dataset(self, dataset: DatasetPayload) -> None:
        if not dataset.company_id.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Dataset must include a company_id",
            )

        max_records = 50000
        if (
            len(dataset.employees) > max_records
            or len(dataset.vendors) > max_records
            or len(dataset.invoices) > max_records
            or len(dataset.approvals) > max_records
            or len(dataset.payments) > max_records
            or len(dataset.relationships) > max_records
        ):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Dataset too large for safe processing",
            )

        employee_ids = {employee.employee_id for employee in dataset.employees}
        vendor_ids = {vendor.vendor_id for vendor in dataset.vendors}
        invoice_ids = {invoice.invoice_id for invoice in dataset.invoices}

        duplicate_errors = []
        duplicate_errors.extend(_find_duplicates(emp.employee_id for emp in dataset.employees))
        duplicate_errors.extend(_find_duplicates(vendor.vendor_id for vendor in dataset.vendors))
        duplicate_errors.extend(_find_duplicates(inv.invoice_id for inv in dataset.invoices))
        duplicate_errors.extend(_find_duplicates(payment.payment_id for payment in dataset.payments))
        if duplicate_errors:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Duplicate identifiers detected: {duplicate_errors}",
            )

        for vendor in dataset.vendors:
            if vendor.created_by not in employee_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Vendor {vendor.vendor_id} references unknown creator {vendor.created_by}",
                )
            if vendor.approved_by and vendor.approved_by not in employee_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Vendor {vendor.vendor_id} references unknown approver {vendor.approved_by}",
                )

        for invoice in dataset.invoices:
            if invoice.vendor_id not in vendor_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invoice {invoice.invoice_id} references unknown vendor {invoice.vendor_id}",
                )
            if invoice.amount <= 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invoice {invoice.invoice_id} has invalid amount {invoice.amount}",
                )

        for approval in dataset.approvals:
            if approval.employee_id not in employee_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Approval {approval.approval_id} references unknown employee {approval.employee_id}",
                )
            if approval.target_type == "vendor" and approval.target_id not in vendor_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Approval {approval.approval_id} references unknown vendor {approval.target_id}",
                )
            if approval.target_type == "invoice" and approval.target_id not in invoice_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Approval {approval.approval_id} references unknown invoice {approval.target_id}",
                )

        for payment in dataset.payments:
            if payment.invoice_id not in invoice_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Payment {payment.payment_id} references unknown invoice {payment.invoice_id}",
                )
            if payment.vendor_id not in vendor_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Payment {payment.payment_id} references unknown vendor {payment.vendor_id}",
                )
            if payment.executed_by not in employee_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Payment {payment.payment_id} references unknown executor {payment.executed_by}",
                )
            if payment.amount <= 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Payment {payment.payment_id} has invalid amount {payment.amount}",
                )

        known_nodes = employee_ids | vendor_ids | invoice_ids | {payment.payment_id for payment in dataset.payments}
        for relation in dataset.relationships:
            if relation.source_id not in known_nodes:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Relationship source {relation.source_id} is unknown",
                )
            if relation.target_id not in known_nodes:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Relationship target {relation.target_id} is unknown",
                )
