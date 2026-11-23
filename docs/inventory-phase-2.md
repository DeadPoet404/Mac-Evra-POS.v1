# Phase 2 persistent inventory and atomic reservations

## Delivery boundary

Phase 2 adds persistent inventory and was applied to the hosted project after review, CI validation, and separate approval. The migration in `supabase/migrations/20261123120000_phase_02_inventory.sql` creates no store, Auth user, employee, customer, sale, payment, trade-in, refund, or sample inventory data. The existing local seed still creates only the development store.

The employee and manager interfaces intentionally continue to use `src/lib/inventory.ts`. The application does not yet have a completed employee sign-in flow, so connecting those client screens now would require a fake identity or weaker RLS. Neither is acceptable.

## Existing UI field mapping

The schema preserves every inventory attribute currently used by `/inventory`, `/new-sale`, and `/manager/inventory`.

| Existing UI field | Persistent field | Notes |
| --- | --- | --- |
| `model` | `device_models.model_name` | Model name displayed in search and device cards |
| `storage` | `device_models.storage_gb` | Server adapter also exposes a `"{n}GB"` display value |
| `colour` | `inventory_devices.colour` | Physical-device attribute |
| `condition` | `inventory_devices.condition` | Restricted to excellent, good, or fair |
| `battery` | `inventory_devices.battery_health` | Integer from 1 through 100 |
| `imei` | `inventory_devices.imei` | Globally unique, 15 digits, and Luhn-valid |
| `cost` | `store_inventory.cost_pesewas` | Integer pesewas; not granted to normal employees |
| `price` | `store_inventory.price_pesewas` | Integer pesewas |
| `status` | `store_inventory.status` | Available, reserved, or sold |
| `addedAt` | `store_inventory.received_at` | Authoritative timestamp rather than display text |

The demonstration arrays still use whole-GHS display values. Future UI integration must convert integer pesewas only at the display boundary; database operations must never store decimal currency values.

## Tables and relationships

### `device_models`

Stores the model name and storage capacity shared by physical devices. Model/storage pairs are case-insensitively unique.

### `inventory_devices`

Represents one physical phone. It references a device model and stores IMEI, colour, condition, and battery health. IMEI has a database unique constraint and a 15-digit Luhn validation check.

### `store_inventory`

Represents the current store assignment, stock state, acquisition cost, selling price, and receipt time for a physical device. A device can have only one current store inventory row. Store and device IDs are repeated in composite keys used by reservations and history so records cannot be attached to a different store.

New inventory must start as `available`. The database permits only these state transitions:

- `available` → `reserved`
- `reserved` → `available`
- `reserved` → `sold`

A device cannot skip reservation and become sold, and sold inventory cannot return to stock through a direct state update.

### `inventory_reservations`

Preserves the employee, active store membership, store, device, creation time, expiry, terminal time, terminal actor, and terminal reason. A partial unique index permits only one active reservation for a store inventory row. Deferred constraint triggers guarantee that reserved inventory has exactly one active reservation and that available or sold inventory has none when the transaction commits.

Reservation records cannot be deleted.

### `inventory_movements`

Append-only state history for intake, reservation, release, expiry, sale, and approved adjustment events. Each movement records the store, physical device, store inventory row, actor, actor membership, reason, timestamp, and reservation when applicable. Updates and deletes are rejected by a trigger.

Reservation RPCs also append a Phase 1 `audit_events` record in the same transaction.

## Reservation lifecycle

| Status | Meaning |
| --- | --- |
| `active` | The device is reserved and not yet elapsed or ended |
| `released` | The owner or an inventory manager explicitly returned it to available stock |
| `expired` | An authorized expiry sweep returned an elapsed reservation to available stock |
| `fulfilled` | Reserved for a future trusted sale-completion operation; Phase 2 does not implement sales |

Reservations default to 15 minutes. The reserve RPC accepts a bounded duration from 1 through 60 minutes. Expiry batches are limited to 1 through 500 records.

The reservation owner may read or release their own reservation only while they retain an active membership and `reserve_inventory`. A different employee cannot release it. A member with `manage_inventory` may release another employee's reservation. Reserve, release, and expiry lock the caller's membership, profile, and store access rows while authorizing, so a concurrent suspension or shutdown serializes before or after the inventory operation. Expiry only affects active records whose `expires_at` is in the past and requires `reserve_inventory` or `manage_inventory` in that store.

## Atomic reservation algorithm

`public.reserve_inventory_device(store_id, device_id, ttl_minutes)` is a security-definer RPC with an empty search path and explicit execution grants only to authenticated users. It:

1. Requires `auth.uid()`.
2. Rechecks an active profile, store, membership, permission overrides, and `reserve_inventory` through the Phase 1 permission helper.
3. Locks the matching `store_inventory` row with `FOR UPDATE`.
4. Resolves an elapsed active reservation while that same inventory lock is held.
5. Returns `sold`, `already_reserved`, or `already_reserved_by_caller` without creating another reservation when appropriate.
6. Creates the active reservation, changes stock to reserved, appends movement history, and appends an audit event in one database transaction.

Concurrent requests for the same physical device serialize on the inventory row. The first transaction creates the reservation. The second sees the committed reserved state and receives `already_reserved`; the partial unique index and deferred consistency triggers are additional integrity barriers. Any exception rolls back the reservation, stock state, movement, and audit event together.

`public.release_inventory_reservation` uses the same inventory-row-first lock order. `public.expire_inventory_reservations` processes a bounded set and locks each inventory row before closing its reservation. This lock order avoids reservation/inventory deadlocks and keeps lifecycle state consistent.

## RLS and privileges

All five Phase 2 tables have RLS enabled and forced. Anonymous users have no table or RPC access.

| Resource | Authenticated access |
| --- | --- |
| Device models | Read for active members |
| Physical devices | Read only when assigned to a store where the caller has employee-workspace access |
| Store inventory | Read only for an authorized store; acquisition cost is not granted |
| Reservations | Read own reservations; inventory managers can read their store's reservations |
| Movements | Read only with `manage_inventory` for that store |
| Direct writes | Denied; lifecycle writes go through the reviewed RPCs |

The service role may read and insert model, physical-device, and initial store-inventory rows, but it cannot directly update stock state or mutate reservation lifecycle rows. Dedicated audited commands are still required before production intake or adjustment integration. Movement updates/deletes and all reservation deletes remain blocked. The service role is not used by `src/lib/inventory-server.ts` and must never be exposed to browser code.

The focused security review additionally verified that every security-definer function has an empty search path and explicit execution grants, no reservation RPC accepts a caller-supplied employee ID, suspended members lose reservation visibility, and reserve/release/expiry recheck and lock the authenticated caller's access chain before changing inventory.

## Next.js server boundary

`src/lib/inventory-server.ts` uses the cookie-aware Supabase server client and the authenticated employee's access token. It exports narrowly scoped functions to:

- list inventory visible in one authorized store;
- read one authorized physical device by database ID or scanned IMEI;
- reserve an available physical device;
- release an authorized reservation;
- expire elapsed reservations in an authorized store.

The server adapter excludes acquisition cost and maps the persistent model to the existing UI concepts. The RPCs repeat authorization checks in PostgreSQL; Next.js checks are not treated as the security boundary.

## Future employee sign-in and sale integration

After an approved employee sign-in flow exists, the next phase should:

1. Resolve the employee's active store membership on the server.
2. Render `/inventory` from `listAuthorizedInventory` without removing the current loading, search, filter, and detail behavior.
3. Resolve scanned IMEIs through `readAuthorizedInventoryDeviceByImei` rather than the demonstration array.
4. Call `reserveAvailableDevice` when the employee commits a device to a sale draft, and retain the returned reservation ID server-side with that draft.
5. Display clear `already_reserved` and `sold` results and refresh inventory rather than trusting stale client state.
6. Release the reservation when an authorized draft is abandoned or cancelled.
7. Revalidate the active reservation in the future transactional sale-completion operation before changing `reserved` to `sold`.

Session storage is not authoritative and must not become proof of a reservation, payment, or completed sale.

## Tests

`supabase/tests/002_inventory_reservations.test.sql` covers IMEI validation and uniqueness, integer-pesewa columns, transition rules, store isolation, acquisition-cost restrictions, direct-write denial, successful reservation, competing reservation results, idempotent retries, expiry, owner and manager release rules, sold-device handling, permission overrides, append-only movement history, preserved reservation history, audit creation, and final status consistency.

`scripts/test-inventory-concurrency.mjs` uses two separate authenticated sessions against one local physical device. It verifies exactly one initial reservation succeeds, races the winning release against a competing reserve, issues two simultaneous releases and confirms only one release movement is written, and runs concurrent no-op expiry sweeps. It refuses every non-local Supabase hostname and loads the local variables from `.env.local` when present. It creates disposable local Auth and inventory fixtures; run a local database reset after the test.

Run against a disposable local Supabase stack:

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:reset
```

These tests require Docker or a compatible local container runtime. They must not be redirected to the hosted project.
