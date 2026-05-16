import { Request } from 'express';
import { AdminActor } from './admin.types';

export function adminActorFromRequest(request: Request): AdminActor {
  const actorId = request.headers['x-actor-id'];
  return {
    actorId: Array.isArray(actorId) ? actorId[0] : actorId,
    ip: clientIp(request),
  };
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
