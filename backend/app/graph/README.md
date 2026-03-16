# Graph Layer

Financial digital twin graph construction and conversion.

## Files
- `graph_builder.py`: Builds/updates a `networkx.MultiDiGraph` from enterprise dataset and derived entities.
- `graph_queries.py`: Converts graph data into frontend-friendly payloads.
- `graph_export.py`: Exports graph in Neo4j-compatible structure.

## Node Families
- Employee, Vendor, Invoice, Approval, Payment, Decision, Rule, Case.

## Edge Families
- CREATED_VENDOR, APPROVED_VENDOR, ISSUED_INVOICE, APPROVED_INVOICE,
  EXECUTED_PAYMENT, DECISION_LINK, TRIGGERED_RULE, PART_OF_CASE, relationship edges.
