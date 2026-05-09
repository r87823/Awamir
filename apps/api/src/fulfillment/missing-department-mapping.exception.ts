import { BadRequestException } from '@nestjs/common';

export class MissingDepartmentMappingException extends BadRequestException {
  constructor(productIds: string[]) {
    super({
      code: 'MISSING_DEPARTMENT_MAPPING',
      message: 'One or more order items have no active department mapping',
      productIds,
    });
  }
}
