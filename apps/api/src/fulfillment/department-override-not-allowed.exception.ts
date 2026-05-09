import { BadRequestException } from '@nestjs/common';

export class DepartmentOverrideNotAllowedException extends BadRequestException {
  constructor() {
    super({
      code: 'DEPARTMENT_OVERRIDE_NOT_ALLOWED',
      message: 'Department override is disabled by system settings',
    });
  }
}
