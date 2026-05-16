import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.auth.login(body, {
      ip: clientIp(request),
    });
  }
}

function clientIp(request: Request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0];
  return (forwardedIp?.trim() || request.ip || request.socket.remoteAddress)
    ?.replace(/^::ffff:/, '')
    .trim();
}
