# Accounting Flow

Accounting users review and submit financial documents without becoming daily operational actors.

Orders, payments, cashboxes, and delivery remain operational records. Accounting review endpoints mark review metadata and enqueue ERPNext sync through `ERPNextSyncService`.

ERP sync success may update:

- accounting status
- ERPNext references
- sync logs
- audit logs

ERP sync success must not mutate operational workflow statuses such as order approval, production, delivery, or cashbox lifecycle state.

`ACCOUNTING_POSTED` is set only by the accounting completion helper after required ERPNext references and payment posting conditions are satisfied.
