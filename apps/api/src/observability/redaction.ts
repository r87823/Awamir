const REDACTED = '[REDACTED]';

const SECRET_KEY_PARTS = [
  'authorization',
  'api_key',
  'apikey',
  'api-secret',
  'api_secret',
  'apisecret',
  'password',
  'secret',
  'token',
  'x-api-key',
];

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      shouldRedact(key) ? REDACTED : redactValue(nested),
    ]),
  );
}

function shouldRedact(key: string) {
  const normalized = key.toLowerCase();
  return SECRET_KEY_PARTS.some((secret) => normalized.includes(secret));
}
