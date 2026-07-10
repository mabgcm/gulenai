# Consistency Report

Generated: 2026-07-10T02:31:00Z

## Pipeline Run

- `chunk`: completed successfully.
- `index`: completed successfully.
- `embed --resume`: completed successfully.
- `qdrant --resume`: completed successfully.
- `diagnose`: completed successfully.

## Embedding Safety

- Documents chunked: 1001.
- Chunks produced: 12675.
- Embedding max input tokens: 8192.
- Maximum verified embedding input: 8102 tokens.
- Oversized embedding inputs: 0.

## Qdrant Consistency

- Collection: `fgulen`.
- Qdrant vectors: 12675.
- Indexed chunks: 12675.
- Embedded chunks: 12675.
- Pending chunks: 0.
- Missing vectors: 0.
- Orphan vectors: 0.
- Vectors deleted during sync: 3.

## Result

The index, local embeddings, and Qdrant collection are consistent.
