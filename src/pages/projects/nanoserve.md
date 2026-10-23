---
layout: ../../layouts/CaseStudy.astro
title: nanoserve
kind: AI infra · LLM inference engine from scratch
summary: A mini LLM inference engine built to learn serving end to end. My own Qwen2 forward pass, KV cache, static and continuous batching, a paged KV cache with preemption, int8/int4 weight quantization and speculative decoding. Every step is checked for correctness against Hugging Face and benchmarked against the step before.
repo: https://github.com/R4255/nanoserve
stats:
  - { n: "3.6×", l: "decode speed from the KV cache", c: cyan }
  - { n: "7.3×", l: "throughput from continuous batching", c: mint }
  - { n: "24 → 94%", l: "KV memory utilization with paging", c: violet }
  - { n: "1.46×", l: "speculative decoding with an int8 draft", c: gold }
stack: [Python, PyTorch, MPS, Qwen2.5-0.5B / 1.5B, Paged KV cache, int8 / int4 kernels, pytest, uv]
next: { href: /projects/hybrid-rag, label: Hybrid RAG }
---

## Why build one

Serving is where an LLM's cost and latency are actually decided, and frameworks like vLLM hide most of it. I wanted to know *why* each technique helps, by how much, and what it costs, so I built each one myself on a laptop (Apple M2, 16 GB, PyTorch on MPS, Qwen2.5-0.5B in fp16) and measured it.

The rule for every step: **outputs must match a reference first, then it gets benchmarked.**

| Step | What | Headline result (measured) |
|---|---|---|
| 1 | Naive loop, no KV cache | 10.8 tok/s; step time grows 45 → 871 ms from context 64 → 2048 |
| 2 | Own model + KV cache | **37.2 tok/s** (3.6×); step flat at ~24–30 ms up to 2048 tokens |
| 3 | Continuous batching | **246.5 tok/s** for 64 requests (7.3×); live-traffic median TTFT 7.4 s → 0.11 s |
| 4 | Paged KV cache | same 48 MB of KV: utilization 24% → 94%, **+29% throughput** (+86% at 18 MB) |
| 5 | int8 / int4 weights | int8: −36% weights, **1.70× decode**, no perplexity change; int4: +24% perplexity |
| 6 | Speculative decoding | fp16 draft: 1.05×. With an **int8 draft: 1.46×**, same output |

## 1 · The naive loop

Without a cache, generating each token re-runs the whole sequence: 43,648 positions pushed through the model for a 299-token sequence, **146× redundant work**, and per-token latency rises for the entire response.

An early lesson: `generate()` silently applied Qwen's default `repetition_penalty=1.1` even when greedy, and my first comparison diverged at token 2. **Library defaults are part of the model's behaviour.**

## 2 · My own model, with a KV cache

I wrote the Qwen2 forward pass myself (embeddings, RMSNorm, RoPE, grouped-query attention, SwiGLU) and loaded the real weights. Its logits match transformers' **exactly** (max difference 0.0).

| | No cache | KV cache |
|---|---|---|
| Decode step, first → last | 44.2 → 147.2 ms | 28.6 → 27.4 ms |
| Throughput | 10.2 tok/s | **37.2 tok/s** |
| End-to-end, 256 tokens | 24.95 s | 6.91 s |

KV costs 12,288 bytes per token here; without grouped-query attention it would be 7× more.

## 3 · Static vs continuous batching

A 16-row decode step costs 2.3× a 1-row step but produces 16 tokens, because the weights are read once per step. 64 requests, output budgets 16–256 tokens:

| Policy | Max batch | Tokens/s | Mean batch | TTFT p50 |
|---|---|---|---|---|
| one at a time | 1 | 33.9 | 1.00 | 115.4 s |
| static | 8 | 114.0 | 4.24 | 31.4 s |
| continuous | 8 | 161.7 | 7.07 | 16.9 s |
| **continuous** | **32** | **246.5** | 19.55 | **1.8 s** |

Static batching wastes seats: one short request finishes and its seat stays empty until the longest one ends. Under live Poisson traffic, continuous batching cut **median time-to-first-token from 7.4 s to 0.11 s**. The cost is honest too: per-token latency rises (55 → 79 ms), so max batch size is a throughput-vs-latency dial.

## 4 · Paged KV cache

Fixed slots reserved 512 tokens per request; requests used ~120 on average, **wasting 76% of KV memory**. A block allocator (16-token pages) with preemption fixed that:

| Budget | Cache | Max running | Tokens/s | KV utilization |
|---|---|---|---|---|
| 48 MB | 8 slots × 512 | 8 | 172.6 | 24% |
| 48 MB | 256 blocks × 16 | 64 | **222.0** (+29%) | **94%** |
| 18 MB | 3 slots × 512 | 3 | 78.8 | 24% |
| 18 MB | 96 blocks × 16 | 64 | **146.5** (+86%) | 94% |

The tighter the memory, the bigger the win: this is why vLLM exists. Packing that tightly causes preemptions (each paid for by recomputing a prefill); the tests force preemption and check the outputs still match.

## 5 · Quantization

| Config | Weights | Decode b1 | Perplexity |
|---|---|---|---|
| fp16 | 942 MB | 40.3 tok/s | 18.67 |
| **int8** | **602 MB** | **68.5 tok/s** | **18.60** |
| int4 g128 | 441 MB | 75.7 tok/s | 23.07 |

int8 is a free lunch here. int4 round-to-nearest damages a 0.5B model. Speed needs fused kernels: dequantize-then-matmul was 7–15× *slower* than fp16. This step also **corrected my step-1 hypothesis**: the batch-1 step is mostly memory reads, not kernel-launch overhead, because int8 saved ~10 ms by reading ~340 MB less.

I caught a measurement bug here too: timing speed *after* the perplexity pass made fp16 look 30% slower. I reordered the script and reran everything.

## 6 · Speculative decoding

A 0.5B draft proposing tokens for a 1.5B target gave only **1.05×**, because the draft costs 54% of a target step at batch 1 on MPS. The arithmetic predicted it: 2.45 tokens/pass × 50.4 ms ÷ (57.3 + 61.8) = 1.04×. Quantizing the draft to int8 halved its cost without hurting acceptance (72.5% vs 72.8%), turning it into **1.46×**. The techniques compose.

## What I took away

- Measure before believing: two of my own hypotheses were wrong, and the benchmarks said so.
- Every speedup has a price (latency, memory, preemptions, accuracy) and the job is choosing which to pay.
- Batching and memory management matter more than clever kernels at this scale.
