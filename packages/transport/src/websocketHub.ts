import type { RawData } from 'ws';
import type { WebSocketHubOptions, RegisterResult, ResumeResult } from './types';
import type { HubState } from './websocketHub/state';
import { createHubState } from './websocketHub/state';
import { registerClient } from './websocketHub/registerClient';
import { handleMessage } from './websocketHub/handleMessage';
import type { WebSocket } from 'ws';

export class WebSocketHub {
  private readonly state: HubState;

  constructor(private readonly options: WebSocketHubOptions) {
    this.state = createHubState(options);
  }

  getMetricsRegistry() {
    return this.state.metrics.getRegistry();
  }

  async register(socket: WebSocket, clientId: string, headers: Record<string, string | string[] | undefined>): Promise<RegisterResult | null> {
    return registerClient(socket, clientId, headers, this.state);
  }

  async handleMessage(clientId: string, raw: RawData): Promise<ResumeResult | void> {
    return handleMessage(clientId, raw, this.state);
  }

  broadcast(message: Parameters<HubState['broadcast']>[0]) {
    this.state.broadcast(message);
  }

  size() {
    return this.state.size();
  }

}
