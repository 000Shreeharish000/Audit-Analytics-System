from __future__ import annotations

from collections import Counter
from typing import Dict, List, Set

import networkx as nx


def _has_relation(graph: nx.MultiDiGraph, source: str, target: str, relation: str) -> bool:
    edge_bundle = graph.get_edge_data(source, target, default={})
    return any(attrs.get("type") == relation for attrs in edge_bundle.values())


def _successors_by_relation(graph: nx.MultiDiGraph, source: str, relation: str) -> List[str]:
    matches = []
    for _, target, _, attrs in graph.out_edges(source, keys=True, data=True):
        if attrs.get("type") == relation:
            matches.append(target)
    return matches


def _predecessors_by_relation(graph: nx.MultiDiGraph, target: str, relation: str) -> List[str]:
    matches = []
    for source, _, _, attrs in graph.in_edges(target, keys=True, data=True):
        if attrs.get("type") == relation:
            matches.append(source)
    return matches


class GraphReasoner:
    def _pathway_entry(
        self,
        *,
        actors: List[str],
        vendor: str,
        invoice: str,
        payment: str,
        path_nodes: List[str],
        pathway_type: str,
        actor_step_counts: Dict[str, int],
    ) -> Dict[str, object]:
        return {
            "actors": actors,
            "actor": actors[0] if actors else "unknown",
            "vendor": vendor,
            "invoice": invoice,
            "payment": payment,
            "path_nodes": path_nodes,
            "path_length": len(path_nodes),
            "pathway_type": pathway_type,
            "actor_step_counts": actor_step_counts,
        }

    def find_control_bypass_paths(
        self,
        graph: nx.MultiDiGraph,
        max_hops: int = 8,
    ) -> List[Dict[str, object]]:
        pathways: List[Dict[str, object]] = []

        vendors = [
            node_id
            for node_id, attrs in graph.nodes(data=True)
            if attrs.get("type") == "Vendor"
            or attrs.get("node_type") in ("vendor", "Vendor")
        ]
        for vendor_id in vendors:
            creators = _predecessors_by_relation(graph, vendor_id, "CREATED_VENDOR")
            vendor_approvers = _predecessors_by_relation(graph, vendor_id, "APPROVED_VENDOR")
            invoices = _successors_by_relation(graph, vendor_id, "ISSUED_INVOICE")

            for invoice_id in invoices:
                invoice_approvers = _predecessors_by_relation(graph, invoice_id, "APPROVED_INVOICE")
                payments = _successors_by_relation(graph, invoice_id, "EXECUTED_PAYMENT")
                for payment_id in payments:
                    payment_executors = _predecessors_by_relation(graph, payment_id, "EXECUTED_PAYMENT")

                    step_sets: List[Set[str]] = [
                        set(creators),
                        set(vendor_approvers),
                        set(invoice_approvers),
                        set(payment_executors),
                    ]
                    if any(not step for step in step_sets):
                        continue

                    intersection = set.intersection(*step_sets)
                    all_actors = set.union(*step_sets)

                    actor_counter = Counter()
                    for step in step_sets:
                        for actor in step:
                            actor_counter[actor] += 1

                    if intersection:
                        primary_actor = sorted(intersection)[0]
                        pathway_nodes = [primary_actor, vendor_id, invoice_id, payment_id]
                        pathways.append(
                            self._pathway_entry(
                                actors=[primary_actor],
                                vendor=vendor_id,
                                invoice=invoice_id,
                                payment=payment_id,
                                path_nodes=pathway_nodes,
                                pathway_type="single_actor_bypass",
                                actor_step_counts=dict(actor_counter),
                            )
                        )
                        continue

                    repeated = [actor for actor, count in actor_counter.items() if count >= 2]
                    if not repeated and len(all_actors) > 3:
                        continue

                    # Collusion pattern where actor roles overlap across multiple control steps.
                    chosen_actors = sorted(repeated or list(all_actors))[:3]
                    path_nodes = [*chosen_actors, vendor_id, invoice_id, payment_id]
                    unique_path_nodes = list(dict.fromkeys(path_nodes))
                    if len(unique_path_nodes) > max_hops:
                        unique_path_nodes = unique_path_nodes[:max_hops]

                    pathways.append(
                        self._pathway_entry(
                            actors=chosen_actors,
                            vendor=vendor_id,
                            invoice=invoice_id,
                            payment=payment_id,
                            path_nodes=unique_path_nodes,
                            pathway_type="collusive_chain",
                            actor_step_counts=dict(actor_counter),
                        )
                    )

        unique = {}
        for pathway in pathways:
            key = (
                tuple(pathway["actors"]),
                pathway["vendor"],
                pathway["invoice"],
                pathway["payment"],
                pathway["pathway_type"],
            )
            unique[key] = pathway
        return list(unique.values())

