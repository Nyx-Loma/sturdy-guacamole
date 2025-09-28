import type { RawData } from 'ws';
import type { HubState } from './state';
import { MessageEnvelopeSchema } from '../schemas';
import type { MessageEnvelope } from '../schemas';
import type { ResumeResult } from '../types';
import { handleResume } from './resume';
import { logWithContext, sanitizeError } from '../logging';

export async function handleMessage(clientId: string, raw: RawData, state: HubState): Promise<ResumeResult | void> {
  const connection = state.connections.get(clientId);
  if (!connection) {
    logWithContext(state.options.logger, 'warn', 'message_no_connection', { clientId });
    return;
  }

  if (state.messageLimiter) {
    try {
      await state.messageLimiter.consume(connection.accountId);
    } catch {
      connection.close(1008, 'message_rate_limited');
      state.metrics.record({ type: 'ws_closed', clientId, accountId: connection.accountId, deviceId: connection.deviceId, closeCode: 1008, reason: 'message_rate_limited' });
      logWithContext(state.options.logger, 'warn', 'message_rate_limited', {
        clientId,
        accountId: connection.accountId,
        deviceId: connection.deviceId
      });
      return;
    }
  }

  const rawBuffer = Array.isArray(raw)
    ? Buffer.concat(raw.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))))
    : Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(raw as ArrayBuffer);

  if (rawBuffer.byteLength > 64 * 1024) {
    state.metrics.record({ type: 'ws_invalid_size', clientId, accountId: connection.accountId, deviceId: connection.deviceId });
    connection.close(1009, 'message_too_large');
    return;
  }

  let envelope: MessageEnvelope;
  try {
    envelope = MessageEnvelopeSchema.parse(JSON.parse(rawBuffer.toString('utf8')));
  } catch (error) {
    logWithContext(state.options.logger, 'warn', 'invalid_frame', {
      clientId,
      accountId: connection.accountId,
      deviceId: connection.deviceId,
      error: sanitizeError(error)
    });
    state.metrics.record({ type: 'ws_invalid_frame', clientId, accountId: connection.accountId, deviceId: connection.deviceId });
    connection.close(1002, 'protocol_error');
    return;
  }

  connection.lastSeenAt = Date.now();
  state.scheduleHeartbeat(connection);

  switch (envelope.type) {
    case 'resume':
      return handleResume(connection, envelope, state);
    case 'msg':
      break;
    case 'typing':
    case 'read':
      if (connection.inFlight.has(envelope.id)) {
        sendAck(connection, envelope.id, 'rejected', undefined, 'duplicate', state);
        return;
      }
      connection.sequence += 1;
      sendAck(connection, envelope.id, 'accepted', connection.sequence, undefined, state);
      return;
    default:
      connection.close(1002, 'invalid_type');
      return;
  }

  if (connection.inFlight.has(envelope.id)) {
    sendAck(connection, envelope.id, 'rejected', undefined, 'duplicate', state);
    return;
  }

  connection.inFlight.add(envelope.id);
  connection.sequence += 1;
  sendAck(connection, envelope.id, 'accepted', connection.sequence, undefined, state);
}

function sendAck(connection: Parameters<typeof handleResume>[0], id: string, status: 'accepted' | 'rejected', seq: number | undefined, reason: string | undefined, state: HubState) {
  const ack = JSON.stringify({ type: 'ack', id, status, seq, reason });
  void (async () => {
    await state.safeSend(connection, ack);
    state.metrics.record({
      type: status === 'accepted' ? 'ws_ack_sent' : 'ws_ack_rejected',
      clientId: connection.id,
      accountId: connection.accountId,
      deviceId: connection.deviceId,
      ackStatus: status,
      ackLatencyMs: Date.now() - connection.lastSeenAt
    });
  })();
  if (status === 'accepted') {
    connection.inFlight.delete(id);
  }
}
