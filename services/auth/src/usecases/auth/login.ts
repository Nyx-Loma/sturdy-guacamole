import { InvalidSignatureError, NotFoundError } from '../../domain/errors';
import type { Container } from '../../container';

interface LoginInput {
  accountId: string;
  deviceId: string;
  deviceSignature: Uint8Array;
  nonce: string;
}

export const login = async ({ repos, services, config }: Container, input: LoginInput) => {
  const device = await repos.devices.findById(input.deviceId);
  if (!device || device.accountId !== input.accountId) {
    throw new NotFoundError('device not found');
  }

  const assertionOk = await services.deviceAssertion.verify(
    Buffer.from(device.publicKey, 'base64'),
    input.nonce,
    input.deviceSignature,
    device.id
  );
  if (!assertionOk) {
    throw new InvalidSignatureError();
  }

  const accessToken = await services.tokens.issueAccessToken({
    accountId: input.accountId,
    deviceId: input.deviceId,
    kid: 'primary'
  });
  const refreshId = services.tokens.issueRefreshTokenId();
  const refreshToken = await repos.tokens.create({
    id: refreshId,
    accountId: input.accountId,
    deviceId: input.deviceId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_MS)
  });

  return { accessToken, refreshToken: refreshToken.id, expiresIn: config.ACCESS_TOKEN_TTL_SECONDS };
};


