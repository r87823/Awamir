const REDACTED = '[REDACTED]';
const SECRET_KEYS = [
  'api_secret',
  'apiSecret',
  'authorization',
  'Authorization',
  'password',
  'secret',
  'token',
];

export function redactERPNextPayload<T>(payload: T): T {
  return redactValue(payload) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      shouldRedact(key) ? REDACTED : redactValue(nestedValue),
    ]),
  );
}

function shouldRedact(key: string): boolean {
  const normalized = key.toLowerCase();

  return SECRET_KEYS.some((secretKey) =>
    normalized.includes(secretKey.toLowerCase()),
  );
}
