---
layout: ../../layouts/CaseStudy.astro
title: Hybrid RAG
kind: AI · retrieval service + evaluation harness
summary: A document QA service with hybrid retrieval (BM25 + dense, fused with Reciprocal Rank Fusion, optionally reranked by a cross-encoder), source citations, a semantic cache, async ingestion and SSE streaming, plus a reproducible eval harness that decides every setting.
repo: https://github.com/R4255/ai_rag_document_semantic_search
stats:
  - { n: "0.728", l: "nDCG@10 on SciFact (BM25: 0.646)", c: gold }
  - { n: "13 ms", l: "p95 for 0.722, the speed pick", c: cyan }
  - { n: "< 10 ms", l: "repeat questions via the cache", c: mint }
  - { n: "300", l: "labelled queries over 12,647 chunks", c: violet }
stack: [Python, FastAPI, asyncio, BM25, Sentence-Transformers, FAISS, Cross-encoder, Gemini / Ollama, SSE, React, TypeScript]
next: { href: /projects/systems, label: Systems from scratch }
---

## The problem

Keyword search misses paraphrases; embedding search misses exact terms like error codes, IDs and names. Most RAG demos pick one and never measure. I wanted a retrieval service where **every choice is backed by a number**.

## How it works

```
Ingest:  documents ─► chunker (120-word windows, 20 overlap) ─┬─► BM25 inverted index
                                                              └─► embedder ─► dense index
Query:   query ─┬─► BM25 top-N ──┐
                └─► dense top-N ─┴─► RRF fusion ─► cross-encoder rerank ─► top-k + stage timings
```

- **RRF instead of score blending.** BM25 scores and cosine similarities live on different scales; RRF uses ranks only, so it needs no calibration.
- **Search mode is a parameter** (`bm25 | dense | hybrid | hybrid_rerank`) on one code path, so ablations are apples to apples.
- **Per-stage latency in every response**: latency is a metric, not an afterthought.

## Results: BEIR SciFact

300 queries over 5,183 abstracts (12,647 chunks), `bge-small-en-v1.5` embeddings, 50 candidates per retriever, Apple M2.

| Configuration | Recall@10 | MRR@10 | nDCG@10 | p95 |
|---|---|---|---|---|
| BM25 | 0.774 | 0.612 | 0.646 | 3.1 ms |
| Dense (bge-small) | 0.820 | 0.696 | 0.721 | 10.5 ms |
| Hybrid RRF (1 : 1) | **0.846** | 0.671 | 0.709 | 13.5 ms |
| Hybrid RRF, BM25 weight 0.3 | 0.826 | 0.694 | 0.722 | 13.3 ms |
| Hybrid + rerank (MiniLM-L6) | 0.840 | 0.689 | 0.719 | 277 ms |
| **Hybrid + rerank (MiniLM-L12)** | 0.840 | **0.701** | **0.728** | 735 ms |

**Best quality:** hybrid + MiniLM-L12 cross-encoder at depth 50, **+12.7% nDCG over BM25**. **Best quality per millisecond:** hybrid with BM25 down-weighted, **0.722 at 13 ms p95**, within 0.006 of the reranked result at ~55× lower latency.

## What the sweep taught me

- **Depth 50 is the sweet spot.** Depth 100 was slower *and* slightly worse; depth 20 gave up ~0.005 nDCG.
- **Bigger is not better.** `bge-reranker-base` (8× the parameters of MiniLM-L12) scored lower at 0.8–2.1 s p50. Domain fit beat model size.
- **Equal-weight RRF isn't optimal here.** SciFact is paraphrase-heavy, so BM25 adds noise; down-weighting it lifts nDCG 0.709 → 0.722. Combining that with reranking did *not* stack, because the reranker benefits from BM25's broader candidate pool.
- On keyword-heavy corpora BM25 deserves more weight. Re-run the sweep on your own labelled queries before choosing.

## The service around it

- **Async ingestion:** uploads return immediately while chunking, embedding and index upserts run in the background, with a live document tracker in the UI.
- **Semantic LRU cache with TTL:** repeat questions skip the LLM entirely and return in under 10 ms, with per-user hit/miss metrics.
- **SSE streaming with citations:** answers stream token by token with verifiable `[source, page]` references, plus a retrieval event carrying mode and stage timings.
- **Runs fully local** on Ollama (`qwen2.5:7b-instruct`, `nomic-embed-text`) or on Gemini with one setting.
- `/api/search` exposes retrieval alone, so modes can be compared from the API docs.

<figure><img src="/img/rag/02-answer-with-citations.png" alt="Answer streamed with source citations" loading="lazy" /><figcaption>A grounded answer with citations, running locally on Ollama with hybrid retrieval.</figcaption></figure>
<div class="grid2">
<figure><img src="/img/rag/03-cache-hit.png" alt="Repeat question served from the semantic cache" loading="lazy" /><figcaption>Repeat question, served from the cache.</figcaption></figure>
<figure><img src="/img/rag/04-api-docs.png" alt="FastAPI docs with search modes" loading="lazy" /><figcaption>The API, including retrieval-only search.</figcaption></figure>
</div>
