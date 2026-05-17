import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
} from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.auth.login(body, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto, @Req() request: Request) {
    return this.auth.refresh(body, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  @Post('logout')
  logout(@Body() body: LogoutDto, @Req() request: Request) {
    return this.auth.logout(body, {
      authorization: authHeader(request),
      ip: clientIp(request),
    });
  }

  @Post('change-password')
  changePassword(@Body() body: ChangePasswordDto, @Req() request: Request) {
    return this.auth.changePassword(body, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  @Post('logout-all')
  logoutAll(@Req() request: Request) {
    return this.auth.logoutAll(authHeader(request));
  }

  @Get('sessions')
  sessions(@Req() request: Request) {
    return this.auth.listOwnSessions(authHeader(request));
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

function userAgent(request: Request) {
  const value = request.headers['user-agent'];
  return Array.isArray(value) ? value[0] : value;
}

function authHeader(request: Request) {
  const value = request.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}
