export interface AuthContext {
  userId: string;
  deviceId: string;
  sessionId: string;
  scope: string[];
  issuedAt: number;
  expiresAt: number;
}
