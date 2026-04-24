/**
 * k6 Rate Limit Test — Traefik Token Bucket Demo
 *
 * Config under test:
 *   average = 15 req/s  (refill rate)
 *   period  = 1s
 *   burst   = 2000      (bucket capacity)
 *
 * Three phases:
 *   1. BURST DRAIN   — flood at 3000 req/s for 1 s → exhausts the 2000-token bucket
 *   2. THROTTLED     — sustain 200 req/s for 10 s  → most requests should 429
 *   3. RECOVERY      — drop to 10 req/s for 10 s   → bucket refills; requests succeed again
 *
 * Run:
 *   k6 run ratelimit_test.js
 *   k6 run --env TARGET_URL=http://myhost ratelimit_test.js
 */

import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ── Custom metrics ──────────────────────────────────────────────────────────
const successCount  = new Counter("req_success");
const throttleCount = new Counter("req_throttled_429");
const errorCount    = new Counter("req_errors");
const throttleRate  = new Rate("throttle_rate");
const latency       = new Trend("req_latency_ms", true);

// ── Config ───────────────────────────────────────────────────────────────────
const TARGET_URL = __ENV.TARGET_URL || "http://localhost";
const ENDPOINT   = `${TARGET_URL}/`;

// ── Scenario definition ───────────────────────────────────────────────────────
export const options = {
    scenarios: {
        // Phase 1: Burst — slam 3 000 req/s to drain the 2 000-token bucket fast
        burst_drain: {
            executor:          "constant-arrival-rate",
            rate:              3000,
            timeUnit:          "1s",
            duration:          "3s",       // 3 s × 3 000 = up to 9 000 attempts; bucket holds 2 000
            preAllocatedVUs:   200,
            maxVUs:            400,
            startTime:         "0s",
            tags:              { phase: "burst" },
        },

        // Phase 2: Throttled — keep hammering above the refill rate; expect ~15/s to pass
        throttled: {
            executor:          "constant-arrival-rate",
            rate:              200,
            timeUnit:          "1s",
            duration:          "10s",
            preAllocatedVUs:   50,
            maxVUs:            100,
            startTime:         "3s",       // starts right after burst
            tags:              { phase: "throttled" },
        },

        // Phase 3: Recovery — back off below refill rate; bucket refills, success climbs
        recovery: {
            executor:          "constant-arrival-rate",
            rate:              10,
            timeUnit:          "1s",
            duration:          "15s",
            preAllocatedVUs:   15,
            maxVUs:            30,
            startTime:         "13s",      // starts after throttled phase
            tags:              { phase: "recovery" },
        },
    },

    thresholds: {
        // During throttled phase the 429 rate should be high (proves limiting works)
        "throttle_rate{phase:throttled}": ["rate>0.5"],

        // During recovery the 429 rate should drop well below 50 %
        "throttle_rate{phase:recovery}": ["rate<0.5"],
    },
};

// ── Default function (runs per VU iteration) ──────────────────────────────────
export default function () {
    const start = Date.now();
    const res   = http.get(ENDPOINT, {
        timeout: "5s",
        tags:    { endpoint: ENDPOINT },
    });
    const elapsed = Date.now() - start;

    latency.add(elapsed);

    if (res.status === 200) {
        successCount.add(1);
        throttleRate.add(false);

        check(res, { "status is 200": (r) => r.status === 200 });

    } else if (res.status === 429) {
        throttleCount.add(1);
        throttleRate.add(true);

        check(res, { "status is 429 (rate limited)": (r) => r.status === 429 });

    } else {
        errorCount.add(1);
        throttleRate.add(false);

        check(res, {
            [`unexpected status ${res.status}`]: () => false,
        });
    }
}