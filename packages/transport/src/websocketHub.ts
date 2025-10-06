import type { RawData } from 'ws';
import type { WebSocketHubOptions, RegisterResult, ResumeResult } from './types.js';
import type { HubState } from './websocketHub/state.js';
import { createHubState, configureResumeStore } from './websocketHub/state.js';
import { registerClient } from './websocketHub/registerClient.js';
import { handleMessage } from './websocketHub/handleMessage.js';
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

  configureResumeStore(store: {
    loadResumeState: WebSocketHubOptions['loadResumeState'];
    persistResumeState: WebSocketHubOptions['persistResumeState'];
    dropResumeState: WebSocketHubOptions['dropResumeState'];
  }) {
    configureResumeStore(this.state, store);
  }

  broadcast(message: Parameters<HubState['broadcast']>[0]) {
    this.state.broadcast(message);
  }

  size() {
    return this.state.size();
  }

}
