import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns the API health status', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      $transaction: jest.fn().mockResolvedValue([0, 0, 0]),
      integrationOutbox: {
        count: jest.fn(),
      },
    };
    const controller = new HealthController(prisma as never);

    await expect(controller.getHealth()).resolves.toEqual({
      status: expect.any(String),
      service: 'awamir-plus-api',
      checks: expect.objectContaining({
        db: { status: 'ok' },
        outbox: { status: 'ok', pending: 0, failed: 0, deadLetter: 0 },
      }),
    });
  });
});
