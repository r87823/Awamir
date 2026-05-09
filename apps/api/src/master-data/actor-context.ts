import { Request } from 'express';
import { ActorContext } from './master-data.types';

export function actorFromRequest(request: Request): ActorContext {
  const actorId = request.headers['x-actor-id'];

  return {
    actorId: Array.isArray(actorId) ? actorId[0] : actorId,
  };
}
