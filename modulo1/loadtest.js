import http from "k6/http";
import { check } from "k6";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

export const options = {
    discardResponseBodies: true,
    scenarios: {
        fast: {
            executor: 'shared-iterations',
            vus: 5,
            iterations: 100,
            maxDuration: '30s',
        },
    },
    thresholds: {
        http_req_duration: ["max<1"],
    },
};

export default function () {
    const res = http.get("http://localhost:8080/echo");

    check(res, {
        "status is 200": (r) => r.status === 200,
        "latency is less than 1ms": (r) => r.timings.duration < 1,
    });
}

export function handleSummary(data) {
    return {
        "summary.html": htmlReport(data),
        stdout: textSummary(data, { indent: '→', enableColors: false }),
    };
}