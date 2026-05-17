# Awamir Plus New Server Installation Runbook

هذا الملف محاكي تثبيت عملي خطوة بخطوة لتجهيز Awamir Plus على سيرفر جديد باستخدام Docker Compose وصور Docker جاهزة من Registry.

المسار المعماري ثابت:

```text
Flutter App -> Awamir Plus Backend -> ERPNext REST API
```

لا تضع رابط ERPNext أو مفاتيحه أو أسراره داخل Flutter. كل إعدادات ERPNext تبقى في بيئة backend فقط.

## 0. قبل البداية

تأكد أن لديك:

- سيرفر Ubuntu 22.04 أو 24.04 بصلاحية `root` أو مستخدم يملك `sudo`.
- دومين API مثل `api.example.com` موجّه بسجل `A` إلى IP السيرفر.
- صور Docker منشورة:
  - `ghcr.io/r87823/awamir-plus-api:sha-<commit>`
  - `ghcr.io/r87823/awamir-plus-worker:sha-<commit>`
- ملفات النشر:
  - `docker-compose.prod.yml`
  - `.env.production.example`
  - إعداد reverse proxy مثل Caddy أو Nginx Proxy Manager.
- أسرار الإنتاج جاهزة خارج Git:
  - كلمة مرور PostgreSQL قوية.
  - `AUTH_JWT_SECRET` عشوائي 32 حرف أو أكثر.
  - بيانات ERPNext: `ERPNEXT_BASE_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`, `ERPNEXT_COMPANY`.
  - حسابات ERPNext والـ warehouse المطلوبة للمزامنة.

قواعد مهمة:

- لا ترفع `.env.production` إلى Git.
- لا تعرض PostgreSQL أو Redis للإنترنت.
- لا تجعل منفذ API `3000` عاما إلا إذا كان محميا بجدار ناري أو load balancer خاص.
- شغّل API خلف HTTPS reverse proxy.
- شغّل worker كخدمة منفصلة عن API.
- لا تشغّل `prisma migrate dev` على الإنتاج؛ استخدم `migrate deploy`.

## 1. تجهيز السيرفر الأساسي

ادخل على السيرفر:

```bash
ssh root@YOUR_SERVER_IP
```

حدّث النظام وثبّت الأدوات الأساسية:

```bash
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw nano
```

ثبّت Docker Engine و Docker Compose plugin:

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

تحقق:

```bash
docker --version
docker compose version
```

فعّل firewall مبدئيا:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

لا تفتح `5432`, `6379`, أو `3000` للعامة في الإنتاج.

## 2. إنشاء مجلد النشر

```bash
mkdir -p /opt/awamir-plus
chmod 700 /opt/awamir-plus
cd /opt/awamir-plus
```

انسخ ملفات النشر من جهازك المحلي إلى السيرفر. مثال من جهازك المحلي:

```bash
scp docker-compose.prod.yml root@YOUR_SERVER_IP:/opt/awamir-plus/
scp .env.production.example root@YOUR_SERVER_IP:/opt/awamir-plus/
```

إذا كنت ستستخدم Caddy على السيرفر، انسخ ملف Caddy المناسب أو جهّز ملفا جديدا على السيرفر.

## 3. إنشاء ملف البيئة

على السيرفر:

```bash
cd /opt/awamir-plus
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

املأ القيم بدون أسرار حقيقية داخل Git. مثال شكل الملف:

```text
NODE_ENV=production
PORT=3000
API_BIND_ADDRESS=127.0.0.1

AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-REPLACE
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-REPLACE
DOCKER_PULL_POLICY=always

POSTGRES_DB=awamir_plus
POSTGRES_USER=awamir
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
DATABASE_URL=postgresql://awamir:REPLACE_WITH_STRONG_PASSWORD@postgres:5432/awamir_plus?schema=public

REDIS_URL=redis://redis:6379/0

AUTH_JWT_SECRET=REPLACE_WITH_32_PLUS_RANDOM_CHARS
AUTH_JWT_EXPIRES_IN_SECONDS=900
AUTH_JWT_ISSUER=awamir-plus
AUTH_JWT_AUDIENCE=awamir-plus-mobile
AUTH_REFRESH_TOKEN_TTL_DAYS=30
AUTH_BCRYPT_COST=12

AUTH_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_RATE_LIMIT_MAX_ATTEMPTS=5
AUTH_REFRESH_RATE_LIMIT_MAX=20
AUTH_ADMIN_RATE_LIMIT_MAX=30

ERPNEXT_BASE_URL=https://erpnext.example.com
ERPNEXT_API_KEY=REPLACE_WITH_ERPNEXT_API_KEY
ERPNEXT_API_SECRET=REPLACE_WITH_ERPNEXT_API_SECRET
ERPNEXT_COMPANY=Awamir Plus
ERPNEXT_TIMEOUT_MS=5000
ERPNEXT_HEALTH_ENABLED=true
ERPNEXT_WORKER_ENABLED=true

ERPNEXT_DEFAULT_CUSTOMER=REPLACE_IF_USED
ERPNEXT_DEFAULT_WAREHOUSE=REPLACE
ERPNEXT_RECEIVABLE_ACCOUNT=REPLACE
ERPNEXT_INCOME_ACCOUNT=REPLACE
ERPNEXT_CASH_ACCOUNT=REPLACE
ERPNEXT_CARD_ACCOUNT=REPLACE
ERPNEXT_TRANSFER_ACCOUNT=REPLACE
ERPNEXT_ONLINE_ACCOUNT=REPLACE
ERPNEXT_CREDIT_ACCOUNT=REPLACE

CORS_ALLOWED_ORIGINS=https://app.example.com
CORS_ORIGINS=https://app.example.com
CORS_CREDENTIALS=false
TRUST_PROXY=1

DOCKER_LOG_MAX_SIZE=10m
DOCKER_LOG_MAX_FILE=5
REDIS_APPENDFSYNC=everysec
LOG_LEVEL=info
```

تحقق أن الملف غير قابل للقراءة من الجميع:

```bash
ls -la .env.production
```

## 4. تسجيل الدخول إلى GHCR إذا كانت الصور خاصة

إذا كانت صور GitHub Container Registry خاصة، سجّل الدخول بتوكن له صلاحية read packages:

```bash
docker login ghcr.io
```

لا تضع التوكن في أي ملف داخل المشروع.

## 5. فحص Docker Compose قبل التشغيل

```bash
cd /opt/awamir-plus
docker compose --env-file .env.production -f docker-compose.prod.yml config
```

إذا فشل الأمر، أصلح `.env.production` قبل بدء أي خدمة.

## 6. سحب الصور

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull api worker
```

تحقق أن الوسوم صحيحة:

```bash
docker image ls | grep awamir-plus
```

## 7. تشغيل PostgreSQL و Redis أولا

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.prod.yml ps postgres redis
```

افحص الصحة:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 80 postgres
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 80 redis
```

## 8. تشغيل migrations

على سيرفر جديد وقبل تشغيل API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
```

لا تستخدم `prisma migrate dev` في الإنتاج.

## 9. Seed اختياري فقط

في الإنتاج الحقيقي لا تشغّل seed إلا إذا كان ذلك قرارا معتمدا. في staging أو بيئة تدريب جديدة يمكن تشغيل:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api pnpm db:seed
```

بعد seed:

- غيّر أو عطّل كلمات مرور demo.
- راجع credential hygiene.
- لا تستخدم حسابات demo لتشغيل فعلي.

## 10. تشغيل API و Worker

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d api worker
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

تأكد أن:

- `api` يعمل بـ `ERPNEXT_WORKER_ENABLED=false`.
- `worker` يعمل بـ `ERPNEXT_WORKER_ENABLED=true`.
- `worker` لا يفتح منفذا عاما.

## 11. إعداد HTTPS Reverse Proxy

الخيار الأبسط: Nginx Proxy Manager أو Caddy على نفس السيرفر يوجّه إلى `127.0.0.1:3000`.

مثال Caddyfile على السيرفر:

```text
api.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

بعد تشغيل Caddy:

```bash
curl -fsS https://api.example.com/health/live
curl -fsS https://api.example.com/health/ready
```

إذا كان reverse proxy داخل Docker، تأكد أنه على نفس الشبكة أو يستطيع الوصول إلى API. إذا كان على host، اترك `API_BIND_ADDRESS=127.0.0.1`.

## 12. فحوصات الصحة الأساسية

من داخل السيرفر:

```bash
curl -fsS http://127.0.0.1:3000/health/live
curl -fsS http://127.0.0.1:3000/health/ready
```

من الخارج:

```bash
curl -fsS https://api.example.com/health/live
curl -fsS https://api.example.com/health/ready
```

افحص السجلات بدون طباعة أسرار:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 120 api
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 120 worker
```

## 13. فحص ERPNext

نفّذ فحص الاتصال من خلال Backend فقط. إذا كان endpoint يتطلب توكن، أضف `Authorization` بتوكن admin:

```bash
curl -fsS -X POST https://api.example.com/erpnext/validate-connection
```

أو:

```bash
curl -fsS -X POST https://api.example.com/erpnext/validate-connection \
  -H "authorization: Bearer REPLACE_WITH_ADMIN_ACCESS_TOKEN"
```

إذا فشل الفحص:

- راجع `ERPNEXT_BASE_URL`.
- راجع أن API key/secret في `.env.production` صحيحة.
- راجع `ERPNEXT_COMPANY`.
- لا تنسخ الأسرار إلى Flutter أو docs أو logs.

## 14. أول نسخة احتياطية بعد التثبيت

أنشئ backup مباشرة بعد نجاح migrations:

```bash
cd /opt/awamir-plus
mkdir -p backups
backup_file="backups/awamir-plus-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"

sha256sum "$backup_file" > "$backup_file.sha256"
ls -lh "$backup_file" "$backup_file.sha256"
```

احتفظ بنسخة خارج السيرفر حسب سياسة النسخ الاحتياطي.

## 15. فحص smoke أولي

نفّذ هذه القائمة قبل تسليم البيئة:

- `/health/live` ناجح.
- `/health/ready` ناجح ويظهر DB و Redis بحالة سليمة.
- تسجيل الدخول بحساب admin يعمل.
- admin settings لا تعرض أسرار ERPNext خام.
- credential hygiene يعمل ويعرض تحذيرات فقط.
- worker يعمل ولا توجد outbox عالقة بشكل غير مبرر.
- ERPNext validate connection ناجح إذا كانت بيئة ERPNext جاهزة.
- CORS يسمح فقط بالأصول المعتمدة.
- السجلات لا تحتوي password أو JWT أو ERPNext secret.

أمثلة أوامر:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 api
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 worker
```

## 16. تشغيل Flutter على API الجديد

Flutter يتصل فقط بـ Awamir Backend:

```bash
cd apps/mobile
flutter run --dart-define=AWAMIR_API_BASE_URL=https://api.example.com
```

لا تضف أي `ERPNEXT_*` إلى Flutter.

## 17. تحديث إصدار على نفس السيرفر

قبل أي تحديث، خذ backup إذا توجد migration أو مخاطرة تشغيلية:

```bash
cd /opt/awamir-plus
mkdir -p backups
backup_file="backups/awamir-plus-before-update-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
```

حدّث image tags في `.env.production`:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-NEW
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-NEW
```

ثم:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml pull api worker

docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps api worker
docker compose --env-file .env.production -f docker-compose.prod.yml ps api worker
curl -fsS http://127.0.0.1:3000/health/ready
```

## 18. Rollback سريع للتطبيق

إذا فشل إصدار جديد، ارجع لوسوم الصور السابقة:

```bash
cd /opt/awamir-plus
nano .env.production
```

أعد القيم السابقة:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-PREVIOUS
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-PREVIOUS
```

ثم:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull api worker
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps api worker
curl -fsS http://127.0.0.1:3000/health/ready
```

Rollback قاعدة البيانات ليس تلقائيا. لا تستعد backup أو تشغّل SQL عكسي إلا بعد موافقة صريحة وخطة مراجعة.

## 19. أوامر تشغيل يومية مفيدة

حالة الخدمات:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

سجلات API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 api
```

سجلات worker:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 worker
```

إعادة تشغيل API فقط:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart api
```

إعادة تشغيل worker فقط:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart worker
```

فحص readiness:

```bash
curl -fsS https://api.example.com/health/ready
```

## 20. أخطاء شائعة وحلولها

### `DATABASE_URL` لا يطابق PostgreSQL

تأكد أن `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` مطابقة لقيمة `DATABASE_URL`.

### فشل Pull من GHCR

إذا كانت الصور خاصة:

```bash
docker login ghcr.io
docker compose --env-file .env.production -f docker-compose.prod.yml pull api worker
```

### `/health/ready` يفشل

افحص:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 120 api
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 120 postgres
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 120 redis
```

### Worker يعمل لكن ERPNext sync لا يتحرك

افحص worker و Redis:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 worker
docker compose --env-file .env.production -f docker-compose.prod.yml exec redis redis-cli ping
```

ثم راجع outbox/sync logs من Admin API.

### مشكلة CORS من Flutter أو Web

تأكد أن الأصل موجود في:

```text
CORS_ALLOWED_ORIGINS=https://app.example.com
```

لا تستخدم `*` في الإنتاج.

## 21. معايير نجاح التثبيت

اعتبر التثبيت ناجحا عندما تتحقق كل النقاط:

- `docker compose ps` يظهر `api`, `worker`, `postgres`, `redis` بحالة سليمة.
- `/health/live` ناجح من الداخل والخارج.
- `/health/ready` ناجح من الداخل والخارج.
- migrations طُبقت بنجاح.
- أول backup تم إنشاؤه وله checksum.
- API خلف HTTPS.
- Postgres و Redis غير مكشوفين للعامة.
- ERPNext validate connection ناجح عند توفر بيانات ERPNext.
- worker يعالج outbox بدون تدخل يدوي.
- Admin settings لا تعرض أسرار ERPNext.
- لا توجد passwords أو JWTs أو ERPNext secrets في logs.
- image tags الحالية والسابقة موثقة للـ rollback.

## 22. ملفات مرجعية

- [Docker Production Deployment](./docker-production.md)
- [Staging Deployment From Registry Images](./staging-deployment.md)
- [Auth Security Runbook](../security/auth-security-runbook.md)
- [Field Testing Runbook](../operations/field-testing-runbook.md)
