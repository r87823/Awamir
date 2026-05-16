import { signAuthToken, verifyAuthToken } from './jwt';

describe('auth jwt', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('requires an env-driven strong secret in staging', () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.AUTH_JWT_SECRET;

    expect(() => signTestToken()).toThrow('AUTH_JWT_SECRET is required');

    process.env.AUTH_JWT_SECRET = 'short';
    expect(() => signTestToken()).toThrow('at least 32 characters');
  });

  it('verifies issuer and audience when configured', () => {
    process.env.AUTH_JWT_SECRET = 'a'.repeat(40);
    process.env.AUTH_JWT_ISSUER = 'issuer-a';
    process.env.AUTH_JWT_AUDIENCE = 'audience-a';

    const token = signTestToken();
    expect(verifyAuthToken(token)).toEqual(
      expect.objectContaining({
        iss: 'issuer-a',
        aud: 'audience-a',
      }),
    );

    process.env.AUTH_JWT_AUDIENCE = 'audience-b';
    expect(verifyAuthToken(token)).toBeNull();
  });
});

function signTestToken() {
  return signAuthToken({
    sub: 'user-1',
    username: 'operator',
    actorId: 'user-1',
    displayName: 'Operator',
    permissions: ['notifications:view'],
    branchIds: [],
    departmentIds: [],
  });
}
