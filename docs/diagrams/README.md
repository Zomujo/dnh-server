# Diagrams

| Diagram | Source | Rendered |
|---|---|---|
| System architecture (GHS hosting) | [architecture.mmd](architecture.mmd) | [PNG](architecture.png) · [SVG](architecture.svg) |
| Data flow | [data-flow.mmd](data-flow.mmd) | [PNG](data-flow.png) · [SVG](data-flow.svg) |
| Data model (ERD of the MongoDB collections) | [erd.mmd](erd.mmd) | [PNG](erd.png) · [SVG](erd.svg) |

The sources are [Mermaid](https://mermaid.js.org/); GitHub renders `.mmd` files
inline. To re-render after editing:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i erd.mmd -o erd.png -s 2 -b white
npx -p @mermaid-js/mermaid-cli mmdc -i erd.mmd -o erd.svg -b white
```

Notes on the ERD:

- Solid lines are ObjectId references (`ref:` in the Mongoose schemas).
  Dotted lines are links through a string field, usually the Firebase `userId`.
- Fields marked `PII` or `health` are personal or health data under the Data
  Protection Act 2012 (Act 843); see [../data-protection.md](../data-protection.md).
- `audit_logs` expires entries after `AUDIT_LOG_TTL_DAYS` (default 730 days).
- `CHAT_ROOM`, `CHAT_MESSAGE` and `CLIENT_AI_CHAT` belong to retired features;
  the collections remain so the features can return.
- Only key fields are shown. The schemas in `src/**/entities/*.entity.ts` are
  the source of truth.
