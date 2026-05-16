import { BadRequestException } from '@nestjs/common';
import bcrypt from 'bcryptjs';

export function validatePasswordPolicy(password: string) {
  const minLength = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 8);
  if (!password || password.length < minLength) {
    throw passwordPolicyError(
      `Password must be at least ${minLength} characters`,
    );
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw passwordPolicyError('Password must include letters and numbers');
  }
}

export async function hashPassword(password: string) {
  validatePasswordPolicy(password);
  return bcrypt.hash(password, bcryptCost());
}

function bcryptCost() {
  const value = Number(process.env.AUTH_BCRYPT_COST ?? 12);
  if (!Number.isInteger(value) || value < 10 || value > 14) return 12;
  return value;
}

function passwordPolicyError(message: string) {
  return new BadRequestException({
    code: 'ADMIN_PASSWORD_POLICY_VIOLATION',
    message,
  });
}
