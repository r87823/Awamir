import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class InvalidStatusTransitionException extends BadRequestException {
  constructor(from: string, action: string) {
    super({
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot apply ${action} from ${from}`,
      from,
      action,
    });
  }
}

export class OrderEditNotAllowedException extends BadRequestException {
  constructor(status: string) {
    super({
      code: 'ORDER_EDIT_NOT_ALLOWED',
      message: `Order cannot be edited while status is ${status}`,
      status,
    });
  }
}

export class OrderVersionConflictException extends ConflictException {
  constructor() {
    super({
      code: 'ORDER_VERSION_CONFLICT',
      message: 'Order version does not match the latest version',
    });
  }
}

export class OrderNotFoundException extends NotFoundException {
  constructor() {
    super({ code: 'ORDER_NOT_FOUND' });
  }
}

export class BranchScopeForbiddenException extends ForbiddenException {
  constructor() {
    super({
      code: 'BRANCH_SCOPE_FORBIDDEN',
      message: 'Order is outside the current branch scope',
    });
  }
}

export class RejectionReasonRequiredException extends BadRequestException {
  constructor() {
    super({
      code: 'REJECTION_REASON_REQUIRED',
      message: 'rejection_reason is required',
    });
  }
}

export class ReturnNotesRequiredException extends BadRequestException {
  constructor() {
    super({
      code: 'RETURN_NOTES_REQUIRED',
      message: 'notes are required',
    });
  }
}
