import { describe, expect, it } from 'vitest';
import { AuthMetrics } from '../../domain/metrics';

describe('AuthMetrics', () => {
  const readMetrics = async (metrics: AuthMetrics) => metrics.getRegistry().metrics();

  it('records captcha verdicts', async () => {
    const metrics = new AuthMetrics();
    metrics.recordCaptcha('allow', 'turnstile');
    metrics.recordCaptcha('deny', 'turnstile');
    expect(metrics.getCaptchaCount('allow', 'turnstile')).toBe(1);
    expect(metrics.getCaptchaCount('deny', 'turnstile')).toBe(1);
    const output = await readMetrics(metrics);
    expect(output).toMatch(/auth_captcha_result_total\{verdict="allow",provider="turnstile"\} 1/);
    expect(output).toMatch(/auth_captcha_result_total\{verdict="deny",provider="turnstile"\} 1/);
  });

  it('records backup events with bucketed sizes', async () => {
    const metrics = new AuthMetrics();
    metrics.recordBackup('prepare', 'ok', 100);
    metrics.recordBackup('submit', 'fail', 4000);
    metrics.recordBackup('restore', 'fail');
    const output = await readMetrics(metrics);
    expect(output).toMatch(/auth_backup_event_total\{stage="prepare",outcome="ok",size_bucket="small"\} 1/);
    expect(output).toMatch(/auth_backup_event_total\{stage="submit",outcome="fail",size_bucket="large"\} 1/);
    expect(output).toMatch(/auth_backup_event_total\{stage="restore",outcome="fail",size_bucket="small"\} 1/);
  });

  it('observes latency for backup stages', async () => {
    const metrics = new AuthMetrics();
    metrics.observeBackupLatency('restore', 123);
    const output = await readMetrics(metrics);
    expect(output).toMatch(/auth_backup_stage_latency_ms_sum\{stage="restore"\} 123/);
  });

  it('exposes underlying counters and histogram', () => {
    const metrics = new AuthMetrics();
    metrics.recordCaptcha('allow', 'external');
    metrics.recordBackup('status', 'ok', 600);
    metrics.observeBackupLatency('status', 42);

    expect(metrics.getCaptchaCounter()).toBeDefined();
    expect(metrics.getBackupEventsCounter()).toBeDefined();
    expect(metrics.getBackupLatencyHistogram()).toBeDefined();
    expect(metrics.getCaptchaCount('allow', 'external')).toBe(1);
  });
});
