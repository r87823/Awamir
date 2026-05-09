import { MissingDepartmentMappingException } from './missing-department-mapping.exception';
import { FulfillmentService } from './fulfillment.service';

describe('FulfillmentService', () => {
  const audit = { record: jest.fn() };
  const stateMachine = { transition: jest.fn() };

  it('rejects split validation when a product has no active mapping', async () => {
    const prisma = {
      itemDepartmentMapping: {
        findMany: jest.fn().mockResolvedValue([{ productId: 'product-1' }]),
      },
    };
    const service = new FulfillmentService(
      prisma as never,
      audit as never,
      stateMachine as never,
    );

    await expect(
      service.validateSplit({
        items: [
          { productId: 'product-1', quantity: 1 },
          { productId: 'product-2', quantity: 1 },
        ],
      }),
    ).rejects.toThrow(MissingDepartmentMappingException);
  });

  it('allows split validation when all products have active mappings', async () => {
    const prisma = {
      itemDepartmentMapping: {
        findMany: jest.fn().mockResolvedValue([{ productId: 'product-1' }]),
      },
    };
    const service = new FulfillmentService(
      prisma as never,
      audit as never,
      stateMachine as never,
    );

    await expect(
      service.validateSplit({
        items: [{ productId: 'product-1', quantity: 1 }],
      }),
    ).resolves.toEqual({ valid: true });
  });
});
