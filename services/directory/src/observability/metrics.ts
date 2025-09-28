import { Histogram, Counter, register } from 'prom-client';

register.setDefaultLabels({ service: 'directory' });

export const requestTotalCounter = new Counter({
  name: 'directory_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'method'] as const
});

export const requestDurationHistogram = new Histogram({
  name: 'directory_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['route', 'method', 'status_code'] as const,
  buckets: [10, 20, 50, 100, 200, 500, 1000]
});


