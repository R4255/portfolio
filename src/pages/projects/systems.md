---
layout: ../../layouts/CaseStudy.astro
title: Systems from scratch
kind: Backend · the boxes, opened up
summary: Day to day I use Redis, Kafka and model servers. On the side I build small versions of them, to understand what they guarantee, where they bend, and how to measure it. Four of those builds.
stats:
  - { n: "150", l: "virtual nodes per cache server", c: violet }
  - { n: "O(log K + r)", l: "time-window log queries", c: cyan }
  - { n: "0 / 239", l: "failed inference requests under load", c: mint }
  - { n: "0", l: "short-code collisions, by construction", c: gold }
stack: [Python, asyncio, FastAPI, Flask, PostgreSQL, Redis, NVIDIA Triton, ONNX, gRPC, Prometheus, Grafana, k6, Locust, Jenkins, Docker]
next: { href: /work, label: Everything else }
---

<h2 id="cache">Distributed Cache</h2>

A cache cluster with the moving parts of the real thing. [Code ↗](https://github.com/R4255/Distributed_Cache_System)

- **Consistent hashing with virtual nodes.** Keys hash (MD5) onto a ring; each physical node owns 150 virtual positions, so load spreads evenly and adding or removing a node remaps only ~1/N of keys instead of nearly all of them, which is what `hash % N` does. (That's the ring on the home page: try adding a node.)
- **Eviction policies:** O(1) LRU on an `OrderedDict` (replacing an earlier O(n) `min()` scan), O(log n) LFU on a min-heap with version-based lazy deletion, and TTL expiry with background cleanup.
- **Two front doors:** a Redis-style text protocol over asyncio TCP (`GET`, `SET key value [ttl]`, `DEL`, `STATS`) and a FastAPI REST API with batch get/set, ring inspection (`/ring/debug/{key}` shows where a key routes) and admin endpoints to add or remove nodes at runtime.
- **Observability and load:** Prometheus metrics with Grafana dashboards, and four k6 suites: smoke, load (ramping to 500 virtual users on an 80/20 read/write mix, with p95 < 100 ms and p99 < 250 ms thresholds), soak and spike.

<h2 id="logs">In-memory Log Store</h2>

A service that ingests logs from many microservices concurrently and answers *"logs for service X on host Y between t1 and t2"* quickly, all in memory. [Code ↗](https://github.com/R4255/chiron_logs_in_memory)

- **Index by access pattern.** Three indexes (by service, by host, by service+host) make choosing the right bucket O(1).
- **Sorted buckets, binary-search windows.** Every bucket stays ordered by timestamp via `bisect.insort`, so a time-range query is two binary searches and a slice, **O(log K + r)** instead of a linear scan. The trade-off is deliberate: inserts pay O(N) shifts because log systems read far more than they write, and the docs name the upgrade path (`SortedList`) if writes become the bottleneck.
- **Reader-writer lock.** An async RW lock lets any number of queries run together while ingestion gets exclusive access.
- **Latency you can see.** A rolling window (bounded `deque`) tracks write and read latency separately, measured from *before* lock acquisition so waiting time counts, and serves p50/p75/p95/p99/p99.9 at `/metrics`.
- **Four benchmarks**, each answering one question: ingestion throughput sequential vs concurrent; query p99 with bisect vs linear scan at 100k+ logs per bucket; whether 50 concurrent heavy readers really run in parallel; and **write starvation**, meaning how long writers queue behind long reads.

<h2 id="triton">YOLOv8 serving on NVIDIA Triton</h2>

Production-shaped model serving: a stateless FastAPI tier in front of NVIDIA Triton over gRPC. [Code ↗](https://github.com/R4255/upjao_)

- **Dynamic batching** in Triton (preferred batch sizes 4/8/16, 5 ms max queue delay) groups concurrent requests into one GPU/CPU pass.
- An init container exports YOLOv8 to **ONNX** and lays out the model repository automatically.
- **Graceful degradation:** `/health` returns 503 when Triton is unavailable (fit for Kubernetes readiness probes), and `/predict` fails fast with structured errors instead of hanging connections.
- Per-request latency split into preprocess / inference / postprocess, plus Prometheus metrics from both tiers.
- **k6 load test** at 15 concurrent users: **239 requests, 0 failed, 717/717 checks passed, p95 2.39 s** on CPU.
- Scaling plan: scale the CPU-bound FastAPI tier on CPU (HPA) and the Triton tier on queue depth or GPU utilization, so expensive GPU nodes aren't scaled just to run preprocessing.

<h2 id="shortener">URL Shortener</h2>

A complete small product: API, frontend, cache, analytics, monitoring and CI. [Code ↗](https://github.com/R4255/URLShortener)

- **Collision-free codes without lookups.** A Redis atomic `INCR` produces a unique counter; a 32-bit XOR with a fixed key scrambles it (a bijection, so still unique) so codes aren't guessable in sequence; Base62 encoding keeps them at 6 characters. A random fallback covers Redis outages.
- **Read path:** redirects are served from Redis (`SETEX`) with Postgres as the source of truth; every access records IP, user agent and referrer for the stats page.
- Flask + SQLAlchemy with a tuned connection pool, a React stats dashboard, Prometheus + Grafana, a concurrent load-test script, and a **Jenkins pipeline** (checkout → build → test → deploy on `main`), all in Docker Compose.
