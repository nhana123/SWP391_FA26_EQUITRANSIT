# FE2 handoff

Backend contract baseline: `de7b083a21c18bb0be2ea41e7c93a720c5c1670f`.

PR26 removes the custom ASCII filter from all public auth email DTOs and applies
PHONE/nullable-text validation to registration. Public email controls now delegate
grammar to the backend instead of native browser ASCII-only email validation.
PR27 changes OpenAPI representation of nullable draft services (`anyOf` reference
or null), not runtime JSON. Keep `services: null` valid on draft payloads; F05
confirmation still requires a complete nonnull service-preferences object.
HealthResponse has the same `{status: "UP", application: "EquiTransit"}` runtime
body. Customer/login fields, role vocabulary and endpoint paths remain unchanged.

The DTO audit changes require departure/importType at submission. Formats now
include MICROCHIP 9–15 uppercase letters/digits/hyphens, PASSPORT 5–20,
PHONE `^\+?[1-9]\d{7,14}$`, and named Region/City timezones (use Etc/UTC rather
than UTC in write commands). Provider contacts use PHONE, not arbitrary contact
notes. All nullable optional text must be null or nonblank. The request/response
field names and FE1 endpoint paths remain unchanged.

## Entry points

- `src/app/router.tsx`: append routes to the customer tree or an appropriate
  `RoleGate`. Add navigation only for implemented capabilities.
- `src/shared/api/session.ts`: `useSession`, `getSession`, `startSession`,
  `clearSession`. `generation` scopes data; role never authorizes a BE request.
- `src/shared/api/client.ts`: `request(path, zodSchema, options)`;
  `ApiError.status/code/fields/uncertain`. Each response requires a parser.
- `src/shared/api/query.ts`: the single `queryClient` and `queryKeys`.
- `src/shared/api/contracts.ts`: `Order`, `OrderDraft`, `ServicePreferences`.
- `src/features/transport-orders/pages.tsx`: `OrderEditor` accepts an optional
  `servicesSlot(props)`; `ServicesSlotProps` includes saved order, preferences
  and `onSaved(currentOrder)`. Render FE2's component inside that slot.

The slot should be a pure render function returning a component element. Hooks
belong inside that component. Save the journey/horse before opening service
selection. Do not confirm selections on mount/open/close. After a successful F05
confirmation, GET current order before calling `onSaved`; do not pass the command
receipt as current state. Never allow this callback to discard an unsaved journey;
ask the user to save/reload first.

## Full replacement

FE1's draft adapter explicitly copies only editable journey fields and preserves
the complete `services` object supplied by GET. FE2 must likewise preserve all
journey/receiver/event/transit fields when replacing the draft. No spread of
OrderResponse into a write body: pointers, owner, status and computed fields are
server-owned.

Full service state includes arrangements, stall, care, groom/boarding counts,
quarantine and insurance preferences, declaredValue, existingPolicyReference,
escort notes and provider names/contacts. Do not reduce it to one popup's fields.
The current F05 GET/confirm adapters and DTOs should be implemented by FE2 from
actual source, not inferred from this handoff.

## Invalidation

After service confirm: refresh current order, services, assessment and revision
history in this session. After horse update: horse list/detail and service
disclosures are invalidated, historical revision snapshots are never edited.
Keep FE2's keys beneath `queryKeys.session(generation)` to ensure logout clears
all data. Use `queryKeys.orders` and `queryKeys.services` for shared invalidation.

No price-preview endpoint exists. Dirty selections must not display a saved price
as the price of the new choice. Public quantities/money are decimal strings or
null; render them without floating-point arithmetic. Eligibility, assessment,
quote/payment, carrier reservation and departure are independent states.
