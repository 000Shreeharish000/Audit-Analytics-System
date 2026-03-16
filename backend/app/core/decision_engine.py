from __future__ import annotations

from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5

from app.models.decision import DatasetPayload, Decision


def _decision_id(action: str, actor_id: str, timestamp: datetime, context: dict) -> str:
    seed = f"{action}|{actor_id}|{timestamp.isoformat()}|{sorted(context.items())}"
    return f"DEC-{uuid5(NAMESPACE_URL, seed).hex[:12]}"


class DecisionEngine:
    def generate(self, dataset: DatasetPayload) -> list[Decision]:
        decisions: list[Decision] = []
        vendor_creator_map = {vendor.vendor_id: vendor.created_by for vendor in dataset.vendors}

        for vendor in dataset.vendors:
            context = {"vendor_id": vendor.vendor_id}
            decisions.append(
                Decision(
                    decision_id=_decision_id(
                        "create_vendor", vendor.created_by, vendor.created_at, context
                    ),
                    action="create_vendor",
                    actor_id=vendor.created_by,
                    timestamp=vendor.created_at,
                    context=context,
                )
            )
            if vendor.approved_by:
                approved_at = vendor.approved_at or vendor.created_at
                context = {"vendor_id": vendor.vendor_id}
                decisions.append(
                    Decision(
                        decision_id=_decision_id(
                            "approve_vendor",
                            vendor.approved_by,
                            approved_at,
                            context,
                        ),
                        action="approve_vendor",
                        actor_id=vendor.approved_by,
                        timestamp=approved_at,
                        context=context,
                    )
                )

        for invoice in dataset.invoices:
            actor = invoice.submitted_by or vendor_creator_map.get(invoice.vendor_id, "system")
            context = {
                "invoice_id": invoice.invoice_id,
                "vendor_id": invoice.vendor_id,
                "amount": invoice.amount,
            }
            decisions.append(
                Decision(
                    decision_id=_decision_id("issue_invoice", actor, invoice.created_at, context),
                    action="issue_invoice",
                    actor_id=actor,
                    timestamp=invoice.created_at,
                    context=context,
                )
            )

        for approval in dataset.approvals:
            context = {"target_type": approval.target_type, "target_id": approval.target_id}
            decisions.append(
                Decision(
                    decision_id=_decision_id(
                        f"approve_{approval.target_type}",
                        approval.employee_id,
                        approval.approved_at,
                        context,
                    ),
                    action=f"approve_{approval.target_type}",
                    actor_id=approval.employee_id,
                    timestamp=approval.approved_at,
                    context=context,
                )
            )

        for payment in dataset.payments:
            context = {
                "payment_id": payment.payment_id,
                "invoice_id": payment.invoice_id,
                "vendor_id": payment.vendor_id,
                "amount": payment.amount,
            }
            decisions.append(
                Decision(
                    decision_id=_decision_id(
                        "execute_payment",
                        payment.executed_by,
                        payment.executed_at,
                        context,
                    ),
                    action="execute_payment",
                    actor_id=payment.executed_by,
                    timestamp=payment.executed_at,
                    context=context,
                )
            )

        if not decisions:
            now = datetime.now(timezone.utc)
            decisions.append(
                Decision(
                    decision_id=_decision_id("noop", "system", now, {}),
                    action="noop",
                    actor_id="system",
                    timestamp=now,
                    context={},
                )
            )
        return decisions

