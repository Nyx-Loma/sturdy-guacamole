import type { AuthContext } from '../types/auth.types';
import type { Actor } from '../../ports/shared/types';

export const convertAuthToActor = (auth: AuthContext): Actor => ({
  id: auth.userId,
  role: 'user',
  deviceId: auth.deviceId,
  sessionId: auth.sessionId,
});
