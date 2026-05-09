# Request Correlation And Tracing

The API accepts optional `x-request-id` and `x-correlation-id` headers.

If a header is missing, the backend generates an id. Both values are returned on every response. The request context uses AsyncLocalStorage so services, domain events, logs, outbox rows, and ERPNext sync logs can share the same correlation id without passing it through every method manually.

The structured logging fields are:

- request id
- correlation id
- actor id
- entity type
- entity id
- module
- event
- duration
- status

Sensitive values are redacted before logging. This includes authorization headers, tokens, passwords, API keys, and API secrets.
