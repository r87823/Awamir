CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "user_agent" TEXT,
    "ip_hash" VARCHAR(128),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" VARCHAR(160),
    "replaced_by_session_id" UUID,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
CREATE INDEX "auth_sessions_revoked_at_idx" ON "auth_sessions"("revoked_at");

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_replaced_by_session_id_fkey"
  FOREIGN KEY ("replaced_by_session_id") REFERENCES "auth_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
