from __future__ import annotations

from typing import Any, Dict, List

import networkx as nx


def graph_to_payload(graph: nx.MultiDiGraph) -> Dict[str, Any]:
    nodes: List[Dict[str, Any]] = []
    risk_node_ids: List[str] = []

    for node_id, attrs in graph.nodes(data=True):
        node_entry = {"id": str(node_id)}
        for key, value in attrs.items():
            if value is not None:
                node_entry[key] = str(value) if not isinstance(value, (int, float, bool)) else value
        # Expose 'type' as an alias for 'node_type' so the frontend can filter by either key
        if "node_type" in node_entry and "type" not in node_entry:
            node_entry["type"] = node_entry["node_type"]
        nodes.append(node_entry)
        # Track Case and Rule nodes as risk nodes for the frontend
        ntype = node_entry.get("node_type", "")
        nid = str(node_id)
        if ntype in ("Case", "Rule") or nid.startswith("CASE") or nid.startswith("RULE:"):
            risk_node_ids.append(nid)

    edges: List[Dict[str, Any]] = []
    # If MultiDiGraph, it yields (source, target, key, attrs)
    if graph.is_multigraph():
        for source, target, key, attrs in graph.edges(keys=True, data=True):
            edge_id = str(key) if isinstance(key, str) and len(str(key)) > 5 else f"{source}__{target}__{key}"
            edges.append(
                {
                    "id": edge_id,
                    "source": str(source),
                    "target": str(target),
                    "edge_type": str(attrs.get("edge_type", attrs.get("type", ""))),
                }
            )
    else:
        for source, target, attrs in graph.edges(data=True):
            edges.append(
                {
                    "id": f"{source}__{target}",
                    "source": str(source),
                    "target": str(target),
                    "edge_type": str(attrs.get("edge_type", attrs.get("type", ""))),
                }
            )

    return {
        "nodes": nodes,
        "edges": edges,
        "risk_node_ids": risk_node_ids,
        "stats": {
            "total_nodes": graph.number_of_nodes(),
            "total_edges": graph.number_of_edges(),
        }
    }

