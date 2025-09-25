import type { Connection } from './connection';

export interface SendGuardOptions {
  maxBufferedBytes: number;
}

export class SendGuard {
  constructor(private readonly options: SendGuardOptions) {}

  canSend(connection: Connection) {
    if (connection.socket.readyState !== connection.socket.OPEN) {
      return false;
    }

    if (connection.socket.bufferedAmount > this.options.maxBufferedBytes) {
      connection.close(1013, 'overloaded');
      return false;
    }

    return true;
  }

  send(connection: Connection, payload: string | Buffer) {
    if (!this.canSend(connection)) return;
    connection.enqueue(payload);
  }
}
