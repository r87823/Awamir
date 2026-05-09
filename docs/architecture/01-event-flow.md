# Event Flow

Awamir Plus uses an in-process domain event bus for side effects that should not own critical state transitions.

Services keep transactional state changes inside their own methods and emit typed domain events after the operational change is committed or safely durable. Handlers perform side effects such as audit log creation, notification creation, and tracing.

Handler failures are logged and do not rollback committed Awamir state.

Each domain event includes:

- event name
- correlation id
- actor id when available
- entity type
- entity id
- occurrence timestamp
- payload

Request correlation is supplied from request context when the emitting service does not pass an explicit correlation id.
