export type NotificationListQuery = {
  page?: number;
  pageSize?: number;
  unreadOnly?: string | boolean;
  type?: string;
};

export type NotificationActorContext = {
  actorId?: string;
  driverId?: string;
};
