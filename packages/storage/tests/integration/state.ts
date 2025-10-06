export type IntegrationAvailability =
  | { ready: true }
  | { ready: false; reason: string; error?: unknown };

declare global {
  var __storageIntegrationAvailability__: IntegrationAvailability | undefined;
}

export function setIntegrationAvailability(state: IntegrationAvailability): void {
  globalThis.__storageIntegrationAvailability__ = state;
}

export function getIntegrationAvailability(): IntegrationAvailability | undefined {
  return globalThis.__storageIntegrationAvailability__;
}
