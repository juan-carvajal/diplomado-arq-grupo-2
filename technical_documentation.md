# Technical Documentation — Module 1: Minimum Latency Challenge

## 1. System Architecture

The system is an ultra-low-latency HTTP server written in **Go** that permanently listens for incoming requests and responds with the message `pong` as fast as possible.

### Components

```
Client (k6)  ──HTTP GET──▶  fasthttp server (:8080)  ──▶  "pong" response
```

| Component | Technology | Role |
|---|---|---|
| HTTP Server | Go + `fasthttp` | Receives stimuli and returns a response |
| Load tester | k6 | Sends stimuli and measures latency |
| Report | k6-reporter (HTML) | Results visualization |

### Request Flow

1. The client sends `GET /echo` to the server at `localhost:8080`.
2. The `fasthttp` handler receives the request directly from a memory pool (no unnecessary allocations).
3. The server writes `pong` into the response buffer.
4. The client receives the response and records the elapsed time.

---

## 2. Justification of Tools, Languages, and Methodologies

### Go as the base language

Go combines near-C performance with a native concurrency model based on goroutines. Its advantages for this challenge are:

- **Compiled to native code**: no JIT or interpreter — execution time per request is predictable and minimal.
- **Lightweight runtime**: the goroutine scheduler has much lower overhead than OS threads.
- **Efficient memory management**: Go's incremental, low-pause garbage collector is critical for maintaining consistent latency.
- `runtime.GOMAXPROCS(runtime.NumCPU())` ensures the server uses all available CPU cores.

### fasthttp instead of `net/http`

Go's standard `net/http` library has intentional overhead (reflection, per-request allocations, header normalization). `fasthttp` eliminates these costs through:

| Optimization | `net/http` | `fasthttp` |
|---|---|---|
| Allocations per request | Multiple | Zero (object pooling) |
| Header parsing | Eager + normalization | Lazy, no normalization |
| Buffers | New per request | Reused via `sync.Pool` |
| Multipart form | Pre-parsed | Disabled |

### Server configuration

```go
DisableHeaderNamesNormalizing: true   // Avoids unnecessary string transformations
DisablePreParseMultipartForm:  true   // Skips multipart form parsing
NoDefaultServerHeader:         true   // Does not write the "Server" header
NoDefaultDate:                 true   // Does not write the "Date" header (costly: requires time.Now())
NoDefaultContentType:          true   // Does not write the "Content-Type" header
ReduceMemoryUsage:             false  // Keeps buffers in memory for maximum speed
Concurrency:                   256 * 1024  // Up to 262,144 concurrent connections
ReadBufferSize / WriteBufferSize: 4096     // Buffers sized to typical request
```

Disabling `NoDefaultDate` is especially significant: every call to `time.Now()` involves a syscall that can add microseconds of latency.

### k6 as the measurement tool

k6 is a load testing framework written in Go, designed to produce high-precision latency metrics with very low client-side overhead. It measures:

- `http_req_duration`: total request time (primary metric)
- `http_req_waiting`: time waiting for the first byte of the response (TTFB)
- `http_req_sending` / `http_req_receiving`: network I/O time

---

## 3. Latency Measurement and Results

### Load test configuration (`loadtest.js`)

```js
scenarios: {
    fast: {
        executor: 'shared-iterations',
        vus: 5,           // 5 concurrent virtual users
        iterations: 100,  // 100 total requests distributed across VUs
        maxDuration: '30s',
    },
},
thresholds: {
    http_req_duration: ["max<1"],  // Threshold: maximum duration < 1ms
},
```

The `max<1` threshold defines that **no single request** may exceed 1 ms in duration. If any request exceeds it, the test fails.

### Results

```
✓ status is 200              (100/100 checks passed)
✓ latency is less than 1ms   (100/100 checks passed)
✓ http_req_duration threshold: max < 1ms — PASSED
```

| Metric | Min | Avg | Max | p(95) | p(99) |
|---|---|---|---|---|---|
| `http_req_duration` | 28.43 µs | 101.29 µs | 518.39 µs | 221.48 µs | 300.83 µs |
| `http_req_waiting` (TTFB) | 16.07 µs | 61.57 µs | 229.36 µs | 116.9 µs | 164.68 µs |
| `http_req_sending` | 1.7 µs | 9.25 µs | 59.42 µs | 29.63 µs | 56.23 µs |
| `http_req_receiving` | 4.2 µs | 30.46 µs | 494.14 µs | 89.95 µs | 260.26 µs |
| `iteration_duration` | 46.93 µs | 193.04 µs | 728.54 µs | 586.31 µs | 717.67 µs |

**Throughput:** 23,753 requests/second
**Error rate:** 0.00%

---

## 4. Results Analysis and Optimizations

### Comparison against the 1 ms objective

| Objective | Result | Status |
|---|---|---|
| Maximum latency < 1 ms | Max: 518.39 µs (≈ 0.52 ms) | **ACHIEVED** |
| Minimum average latency | Avg: 101.29 µs (≈ 0.10 ms) | **ACHIEVED** |
| 0% failed requests | 0 failures in 100 requests | **ACHIEVED** |

The system exceeded the goal: the average latency is approximately **10× lower** than the 1 ms threshold, and the maximum latency is nearly **2× lower**.

### Latency breakdown

`http_req_duration` is composed of three phases:

```
http_req_duration  =  http_req_sending  +  http_req_waiting  +  http_req_receiving
Average: 101 µs    ≈       9 µs         +       62 µs        +       30 µs
```

- **61%** of average time is `http_req_waiting` — the time the server takes to process the request and begin responding. This is the most direct indicator of server performance.
- **30%** is `http_req_receiving` — the response transmission time over the local network.
- **9%** is `http_req_sending` — the time to transmit the request to the server.

### Variability (jitter)

The gap between the average (101 µs) and p(99) (300 µs) reflects ~3× variability at the 99th percentile. This is expected in a local development environment where the OS can preempt the process. In a production environment with CPU pinning and kernel tuning (e.g., `isolcpus`, `SCHED_FIFO`), this variability would decrease significantly.

### Optimizations implemented

1. **Zero-allocation handler**: the handler creates no heap objects — it writes directly into the pooled response buffer.
2. **Minimal headers**: all automatic headers (`Server`, `Date`, `Content-Type`) are disabled, reducing bytes written per response.
3. **Maximum CPU concurrency**: `GOMAXPROCS = NumCPU()` leverages all cores for the goroutine scheduler.
4. **No TLS**: plain HTTP connections, eliminating TLS handshake overhead (confirmed: `http_req_tls_handshaking = 0s`).
5. **Graceful shutdown**: the server handles `SIGINT`/`SIGTERM` to drain in-flight connections before exiting.

---

## 5. Running the System

### Prerequisites

- Go 1.21+
- k6

### Commands

```bash
# Start the server
go run main.go

# Run the load test (in a separate terminal)
make load
# equivalent to:
k6 run --summary-trend-stats="min,avg,max,p(95),p(99)" loadtest.js | tee loadtest.log
```

The server logs its startup and shutdown to stdout and responds to `SIGINT` (Ctrl+C) and `SIGTERM` for graceful shutdown.

---

## 6. Conclusion

The system comfortably exceeded the sub-1 ms latency goal. The combination of **Go** as a compiled, high-performance language, the **fasthttp** library with its zero-allocation model, and an aggressive configuration stripping all unnecessary overhead produced average latencies of ~100 µs, with an absolute maximum of ~518 µs under concurrent load.

The results demonstrate that it is possible to build HTTP servers operating in the microsecond range using high-level languages and tools, without resorting to low-level languages such as C or C++.
