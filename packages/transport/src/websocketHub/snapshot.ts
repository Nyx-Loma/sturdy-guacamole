import type { Connection } from '../connection';
import type { PersistResumeStateParams } from '../types';

export async function persistConnectionSnapshot(connection: Connection, context: { persistResumeState: (state: PersistResumeStateParams) => Promise<void> }) {
  await context.persistResumeState({
    resumeToken: connection.resumeToken,
    accountId: connection.accountId,
    deviceId: connection.deviceId,
    lastServerSeq: connection.serverSequence,
    expiresAt: connection.resumeTokenExpiresAt,
    outboundFrames: [...connection.outboundLog]
  });
}

