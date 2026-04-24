import http from 'k6/http';
import { check } from 'k6';

export const options = {
    scenarios: {
        constant_rps: {
            executor: 'ramping-arrival-rate',

            // Start at 10 RPS
            startRate: 10,
            timeUnit: '1s',

            // Pre-allocate enough VUs to handle peak load
            preAllocatedVUs: 50,
            maxVUs: 100,

            stages: [
                { duration: '5s', target: 10 }, // Hold at 10 RPS for 5s
                { duration: '5s', target: 15 }, // Ramp to 15 RPS over 5s
                { duration: '5s', target: 35 }, // Ramp to 20 RPS over 5s
            ],
        },
    },
};

export default function () {
    const res = http.get('http://localhost/hello');

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });
}