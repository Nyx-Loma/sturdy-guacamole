import type { WebSocket } from 'ws';
import { Connection } from '../connection';
import type { MetricsEvent } from '../types';
import type { HubState } from './state';
import { logWithContext, redactToken } from '../logging';

export async function registerClient(socket: WebSocket, clientId: string, headers: Record<string, unknown>, state: HubState) {
  const auth = await state.authenticate({ clientId, requestHeaders: headers });
  if (!auth) {
    socket.close(1008, 'unauthorized');
    state.metrics.record({ type: 'ws_closed', clientId, closeCode: 1008, reason: 'unauthorized' });
    logWithContext(state.options.logger, 'warn', 'connection_unauthorized', { clientId });
    return null;
  }

  if (state.connectionLimiter) {
    try {
      await state.connectionLimiter.consume(auth.accountId);
    } catch {
      socket.close(1013, 'connection_rate_limited');
      state.metrics.record({ type: 'ws_closed', clientId, accountId: auth.accountId, deviceId: auth.deviceId, closeCode: 1013, reason: 'connection_rate_limited' });
      logWithContext(state.options.logger, 'warn', 'connection_rate_limited', {
        clientId,
        accountId: auth.accountId,
        deviceId: auth.deviceId
      });
      return null;
    }
  }

  const { token: resumeToken, expiresAt } = state.nextResumeToken();
  const connection = new Connection({
    clientId,
    socket,
    accountId: auth.accountId,
    deviceId: auth.deviceId,
    resumeToken,
    resumeTokenExpiresAt: expiresAt,
    maxQueueLength: state.options.maxQueueLength ?? 1024,
    send: state.options.send ?? ((ws, payload, callback) => {
      const maybePromise = ws.send(payload, callback);
      if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
        return maybePromise;
      }
    }),
    emitMetrics: (event: MetricsEvent) => state.metrics.record(event)
  });

  state.connections.set(clientId, connection);
  socket.on('close', () => handleClose(connection, state));
  socket.on('pong', () => handlePong(connection));
  await state.persistSnapshot(connection);

  state.metrics.record({ type: 'ws_connected', clientId, accountId: connection.accountId, deviceId: connection.deviceId });
  logWithContext(state.options.logger, 'info', 'connection_registered', {
    clientId,
    accountId: connection.accountId,
    deviceId: connection.deviceId,
    resumeToken: redactToken(resumeToken)
  });
  state.scheduleHeartbeat(connection);

  return { resumeToken };
}

function handleClose(connection: Connection, state: HubState) {
  state.connections.delete(connection.id);
  if (connection.pingTimeout) {
    clearTimeout(connection.pingTimeout);
  }
  void state.persistSnapshot(connection);
  const ctx = { clientId: connection.id, accountId: connection.accountId, deviceId: connection.deviceId };
  state.metrics.record({ type: 'ws_closed', ...ctx });
  logWithContext(state.options.logger, 'info', 'connection_closed', ctx);
  state.onClose?.(ctx);
}

function handlePong(connection: Connection) {
  const now = Date.now();
  connection.lastSeenAt = now;
  if (connection.lastPingSentAt) {
    const latency = now - connection.lastPingSentAt;
    connection.lastPingSentAt = undefined;
    connection.emitMetrics?.({
      type: 'ws_ping_latency',
      clientId: connection.id,
      accountId: connection.accountId,
      deviceId: connection.deviceId,
      pingLatencyMs: latency
    });
  }
  if (connection.pingTimeout) {
    clearTimeout(connection.pingTimeout);
    connection.pingTimeout = undefined;
  }
}
