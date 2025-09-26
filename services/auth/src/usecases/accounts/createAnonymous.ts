import type { Container } from '../../container';

export const createAnonymousAccount = async ({ repos: { accounts } }: Container) => {
  return accounts.createAnonymous();
};


