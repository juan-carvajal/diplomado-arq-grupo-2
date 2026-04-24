import http from 'k6/http';
import { check } from 'k6';

export const options = {
    scenarios: {
        fixed_iterations: {
            executor: 'shared-iterations',
            vus: 10,
            iterations: 1000,
            maxDuration: '30s',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],   // less than 1% failures
        http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    },
};

export default function () {
    const res = http.get('http://localhost/hello');

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });
}