from __future__ import annotations

from typing import Dict, List

import networkx as nx


def export_to_neo4j_compatible_payload(graph: nx.MultiDiGraph) -> Dict[str, List[Dict[str, object]]]:
    nodes = []
    relations = []

    for node_id, attrs in graph.nodes(data=True):
        nodes.append(
            {
                "id": node_id,
                "labels": [attrs.get("type", "Entity")],
                "properties": attrs,
            }
        )

    for source, target, key, attrs in graph.edges(keys=True, data=True):
        relations.append(
            {
                "id": key,
                "source": source,
                "target": target,
                "type": attrs.get("type", "RELATES_TO"),
                "properties": attrs,
            }
        )

    return {"nodes": nodes, "relationships": relations}

