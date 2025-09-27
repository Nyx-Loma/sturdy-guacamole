import { Counter, Histogram, Registry } from 'prom-client';

export type CaptchaResult = 'allow' | 'deny';
export type BackupStage = 'prepare' | 'submit' | 'status' | 'restore';
export type BackupOutcome = 'ok' | 'fail';
export type BackupSizeBucket = 'small' | 'medium' | 'large';

const sizeBucket = (bytes: number): BackupSizeBucket => {
  if (bytes <= 512) return 'small';
  if (bytes <= 2048) return 'medium';
  return 'large';
};

export class AuthMetrics {
  private readonly registry: Registry;
  private readonly captchaResults: Counter<string>;
  private readonly captchaCounts = new Map<string, number>();
  private readonly backupEvents: Counter<string>;
  private readonly backupLatency: Histogram<string>;

  constructor(registry?: Registry) {
    this.registry = registry ?? new Registry();
    this.captchaResults = new Counter({
      name: 'auth_captcha_result_total',
      help: 'CAPTCHA verification verdicts',
      registers: [this.registry],
      labelNames: ['verdict', 'provider']
    });

    this.backupEvents = new Counter({
      name: 'auth_backup_event_total',
      help: 'Backup flow outcomes',
      registers: [this.registry],
      labelNames: ['stage', 'outcome', 'size_bucket']
    });

    this.backupLatency = new Histogram({
      name: 'auth_backup_stage_latency_ms',
      help: 'Latency of backup flows by stage',
      labelNames: ['stage'],
      buckets: [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000],
      registers: [this.registry]
    });
  }

  recordCaptcha(verdict: CaptchaResult, provider: string) {
    this.captchaResults.labels(verdict, provider).inc();
    const key = this.key(verdict, provider);
    this.captchaCounts.set(key, (this.captchaCounts.get(key) ?? 0) + 1);
  }

  recordBackup(stage: BackupStage, outcome: BackupOutcome, payloadSize?: number) {
    const bucket = payloadSize !== undefined ? sizeBucket(payloadSize) : 'small';
    this.backupEvents.labels(stage, outcome, bucket).inc();
  }

  observeBackupLatency(stage: BackupStage, durationMs: number) {
    this.backupLatency.labels(stage).observe(durationMs);
  }

  getRegistry() {
    return this.registry;
  }

  getCaptchaCounter() {
    return this.captchaResults;
  }

  getCaptchaCount(verdict: CaptchaResult, provider: string) {
    return this.captchaCounts.get(this.key(verdict, provider)) ?? 0;
  }

  getBackupEventsCounter() {
    return this.backupEvents;
  }

  getBackupLatencyHistogram() {
    return this.backupLatency;
  }

  private key(verdict: CaptchaResult, provider: string) {
    return `${verdict}:${provider}`;
  }
}
