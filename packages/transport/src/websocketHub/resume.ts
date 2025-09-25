import type { HubState } from './state';
import type { MessageEnvelope } from '../schemas';
import { MessageEnvelopeSchema, ResumePayloadSchema } from '../schemas';
import type { ResumeResult } from '../types';
import { randomUUID } from 'node:crypto';

export async function handleResume(connection: ReturnType<HubState['connections']['get']>, envelope: MessageEnvelope, state: HubState): Promise<ResumeResult> {
  const validation = MessageEnvelopeSchema.safeParse(envelope);
  if (!validation.success) {
    console.error('handleResume invalid envelope', { clientId: connection.id, envelope, error: validation.error });
    connection.close(1002, 'invalid_resume');
    return { replayCount: 0, batches: 0 };
  }

  let payload;
  try {
    payload = ResumePayloadSchema.parse(envelope.payload);
  } catch (error) {
    console.error('handleResume invalid payload', { clientId: connection.id, payload: envelope.payload, error });
    connection.close(1002, 'invalid_resume');
    return { replayCount: 0, batches: 0 };
  }

  const now = Date.now();
  if (payload.resumeToken !== connection.resumeToken) {
    console.log('handleResume loading persisted state', { token: payload.resumeToken, clientId: connection.id });
    const persisted = await state.loadResumeState(payload.resumeToken);
    console.log('handleResume persisted state result', { token: payload.resumeToken, persistedExists: Boolean(persisted) });
    if (!persisted) {
      connection.close(1008, 'invalid_token');
      return { replayCount: 0, batches: 0 };
    }
    if (persisted.expiresAt < now) {
      await state.dropResumeState(payload.resumeToken);
      connection.close(1008, 'expired_token');
      return { replayCount: 0, batches: 0 };
    }
    if (persisted.accountId !== connection.accountId || persisted.deviceId !== connection.deviceId) {
      connection.close(1008, 'token_conflict');
      return { replayCount: 0, batches: 0 };
    }
    connection.sequence = persisted.lastServerSeq;
    connection.serverSequence = persisted.lastServerSeq;
    connection.outboundLog = persisted.outboundFrames ?? [];
    await state.dropResumeState(payload.resumeToken);
  } else if (now > connection.resumeTokenExpiresAt) {
    // expire old token even if it matches
    await state.dropResumeState(payload.resumeToken).catch(() => undefined);
  }

  const fromSeq = payload.lastClientSeq + 1;
  const { token: rotatedToken, expiresAt } = state.nextResumeToken();
  connection.resumeToken = rotatedToken;
  connection.resumeTokenExpiresAt = expiresAt;

  const resumeAck = JSON.stringify({
    type: 'resume_ack',
    fromSeq,
    expiresInMs: expiresAt - now,
    resumeToken: rotatedToken
  });
  console.log('handleResume sending resume_ack', resumeAck);
  state.safeSend(connection, resumeAck);

  const framesToReplay = connection.outboundLog.filter((frame) => frame.seq >= fromSeq);
  const batches = Math.ceil(framesToReplay.length / state.maxReplayBatchSize) || 0;
  let replayCount = 0;

  state.metrics.record({
    type: 'ws_replay_start',
    clientId: connection.id,
    accountId: connection.accountId,
    deviceId: connection.deviceId,
    replayCount: framesToReplay.length,
    batches
  });

  for (let i = 0; i < framesToReplay.length; i += state.maxReplayBatchSize) {
    const batch = framesToReplay.slice(i, i + state.maxReplayBatchSize);
    for (const frame of batch) {
      if (!state.safeSendWithBackpressure(connection, frame.payload)) {
        break;
      }
      replayCount += 1;
    }
    state.metrics.record({
      type: 'ws_replay_batch_sent',
      clientId: connection.id,
      accountId: connection.accountId,
      deviceId: connection.deviceId,
      batchSize: batch.length
    });
  }

  await state.persistSnapshot(connection);

  state.metrics.record({
    type: 'ws_resume_token_rotated',
    clientId: connection.id,
    accountId: connection.accountId,
    deviceId: connection.deviceId,
    resumeTokenRedacted: redact(rotatedToken)
  });
  state.metrics.record({
    type: 'ws_replay_complete',
    clientId: connection.id,
    accountId: connection.accountId,
    deviceId: connection.deviceId,
    replayCount,
    batches
  });
  state.options.onReplayComplete?.({
    accountId: connection.accountId,
    deviceId: connection.deviceId,
    resumeToken: rotatedToken,
    replayCount,
    batches
  });

  return { replayCount, rotatedToken, batches };
}

function redact(token: string) {
  return token.length > 8 ? `${token.slice(0, 4)}***${token.slice(-4)}` : '***redacted***';
}
