ALTER TABLE "users"
  ADD COLUMN "require_password_change" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "password_changed_at" TIMESTAMP(3);
