import { Request } from 'express';
import { AdminActor } from './admin.types';

export function adminActorFromRequest(request: Request): AdminActor {
  const actorId = request.headers['x-actor-id'];
  return {
    actorId: Array.isArray(actorId) ? actorId[0] : actorId,
  };
}
