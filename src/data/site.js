// Single source of truth for profile facts, links and project metadata.
// Numbers here are copied from each project's own eval / benchmark logs; keep them in sync.

export const profile = {
  name: 'Rohit Gupta',
  role: 'Backend × AI Engineer',
  tagline: 'I build the systems that serve requests and models, and then I measure them.',
  email: 'rohitgupta22022003@gmail.com',
  github: 'https://github.com/R4255',
  linkedin: 'https://linkedin.com/in/rohit-gupta-597755229',
  now: 'SDE I, Backend @ Spinny',
  openTo: 'Backend + AI engineering roles',
};

export const experience = [
  {
    company: 'Spinny',
    role: 'Software Development Engineer I · Backend, Supply Engineering',
    when: 'Mar 2026 – present',
    points: [
      'Built PostgreSQL-backed REST APIs for the dealer-app car-sell module, improving selling efficiency by 22%; defined data models and API contracts with Product and Ops.',
      'Built an async FastAPI endpoint aggregating FASTag, pickup-address and challan lookups with asyncio.gather: 3× faster than sequential calls.',
      'Unit tests, code reviews and production debugging in an Agile team.',
    ],
  },
  {
    company: 'Tata 1mg',
    role: 'Software Development Engineer I',
    when: 'Jul 2025 – Mar 2026',
    points: [
      'Migrated 600GB+ from PostgreSQL to MongoDB with zero downtime using AWS DMS, CDC and an 8-partition Kafka pipeline.',
      'Owned an SQS-based Comments microservice (Sanic, MongoDB) handling 30,000+ events a day.',
      'Cut API latency by 80% with Redis request-context caching.',
      'Replaced a legacy retry library with EventBridge Scheduler, SQS and Redis, improving fault isolation across services.',
    ],
  },
  {
    company: 'Tata 1mg',
    role: 'Software Development Engineer Intern',
    when: 'Jan 2025 – Jun 2025',
    points: ['Built async Sanic REST APIs with pagination to ingest AWS cost and usage events, reducing p95 latency by 40%.'],
  },
];

export const education = {
  school: 'Panjab University (UIET), Chandigarh',
  degree: 'B.E. in Information Technology · CGPA 8.04/10',
  when: '2021 – 2025',
};

// `case` points at an on-site case study; `repo` at GitHub.
export const projects = [
  {
    slug: 'converse', name: 'Converse', kind: 'LLM agent · full stack', featured: true,
    blurb: 'A grocery app you can talk to. The agent searches, fills the cart and drives the UI over a streamed action protocol, and it can never place an order without your click.',
    stat: '74.4 → 93.1%', statLabel: 'task success on a 130-task eval harness',
    stack: ['FastAPI', 'Ollama', 'MLX LoRA', 'pgvector', 'SQS', 'EventBridge', 'React'],
    case: '/projects/converse', repo: 'https://github.com/R4255/converse',
  },
  {
    slug: 'nanoserve', name: 'nanoserve', kind: 'LLM inference engine', featured: true,
    blurb: 'An LLM inference engine written from scratch: my own Qwen2 forward pass, KV cache, continuous batching, a paged KV cache with preemption, int8/int4 quantization and speculative decoding.',
    stat: '7.3×', statLabel: 'throughput from continuous batching, same hardware',
    stack: ['PyTorch', 'MPS', 'Paged KV', 'int8 / int4', 'Speculative decoding'],
    case: '/projects/nanoserve', repo: 'https://github.com/R4255/nanoserve',
  },
  {
    slug: 'hybrid-rag', name: 'Hybrid RAG', kind: 'Retrieval service + eval harness', featured: true,
    blurb: 'BM25 and dense retrieval fused with Reciprocal Rank Fusion, reranked by a cross-encoder, served over FastAPI with SSE streaming, citations and a semantic cache.',
    stat: 'nDCG@10 0.728', statLabel: 'on BEIR SciFact, up from 0.646 for BM25',
    stack: ['FastAPI', 'BM25', 'FAISS', 'Cross-encoder', 'SSE', 'React'],
    case: '/projects/hybrid-rag', repo: 'https://github.com/R4255/ai_rag_document_semantic_search',
  },
  {
    slug: 'distributed-cache', name: 'Distributed Cache', kind: 'Systems from scratch',
    blurb: 'A cache that models a cluster: in-process nodes behind a consistent-hash router (150 virtual nodes each), O(1) LRU, O(log n) LFU with lazy deletion, TTL expiry, Prometheus metrics, and k6 smoke / load / soak / spike suites.',
    stat: '~1/N', statLabel: 'keys remapped when a node joins',
    stack: ['Python', 'asyncio', 'FastAPI', 'Prometheus', 'Grafana', 'k6'],
    case: '/projects/systems#cache', repo: 'https://github.com/R4255/Distributed_Cache_System',
  },
  {
    slug: 'log-store', name: 'In-memory Log Store', kind: 'Systems from scratch',
    blurb: 'Concurrent log ingestion and querying with a reader-writer lock, per-key sorted buckets and binary-search time windows, plus rolling p50–p99.9 latency tracking and four benchmark suites.',
    stat: 'O(log K + r)', statLabel: 'time-range queries per service / host',
    stack: ['FastAPI', 'asyncio', 'aiorwlock', 'pytest'],
    case: '/projects/systems#logs', repo: 'https://github.com/R4255/chiron_logs_in_memory',
  },
  {
    slug: 'triton', name: 'YOLOv8 on Triton', kind: 'Model serving',
    blurb: 'FastAPI front end talking gRPC to NVIDIA Triton with dynamic batching, health-aware graceful degradation, Prometheus metrics and a k6 load test.',
    stat: '0 / 239', statLabel: 'failed requests at 15 concurrent users',
    stack: ['FastAPI', 'Triton', 'ONNX', 'gRPC', 'Prometheus', 'k6'],
    case: '/projects/systems#triton', repo: 'https://github.com/R4255/upjao_',
  },
  {
    slug: 'url-shortener', name: 'URL Shortener', kind: 'Full-stack service',
    blurb: 'Collision-free short codes from a Redis atomic counter scrambled by a 32-bit XOR bijection and Base62-encoded, on Flask + Postgres, with a React stats page, Grafana and a Jenkins pipeline.',
    stat: '0', statLabel: 'collisions by construction',
    stack: ['Flask', 'PostgreSQL', 'Redis', 'React', 'Grafana', 'Jenkins'],
    case: '/projects/systems#shortener', repo: 'https://github.com/R4255/URLShortener',
  },
];

export const openSource = [
  { name: 'Autoloops/greplica', what: 'Added Cursor platform install support (PR #75)', url: 'https://github.com/Autoloops/greplica/pull/75' },
];

export const skills = [
  ['Languages', ['Python', 'SQL', 'JavaScript', 'C++', 'Bash']],
  ['Backend', ['FastAPI', 'Django', 'Sanic', 'Celery', 'REST / OpenAPI', 'Async', 'Microservices']],
  ['Data & messaging', ['PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'SQS', 'ClickHouse', 'pgvector']],
  ['Architecture', ['Event-driven', 'CDC', 'Transactional outbox', 'CQRS', 'Caching', 'Distributed systems']],
  ['Cloud & DevOps', ['AWS (SQS, EventBridge, DMS, Lambda, S3)', 'Docker', 'Podman', 'LocalStack', 'CI/CD']],
  ['AI / ML', ['LLM agents & tool calling', 'LLM evals', 'LoRA (MLX)', 'RAG', 'Hybrid retrieval', 'Reranking', 'Inference serving']],
];
