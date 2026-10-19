# Backend production review — 19 October 2026
## 1. Executive Summary

**Assessment:** the backend has useful domain boundaries and meaningful regression tests, but the reviewed deployment and several request paths need correction before treating this snapshot as production-ready for sensitive, multi-tenant traffic. The most urgent problems are anonymous file writes, cross-tenant file metadata reads, persistent socket access after authorization changes, and a production deployment that does not start the webhook consumer.

Reviewed source: **65166272491ec4b9ffad8cb9ba5ef50ff5116249**, inspected **19 October 2026**. All source paths and line numbers below refer to the **Listenyzen repository**, not this documentation repository. This is a point-in-time review, not a statement that these problems exist in the currently deployed image. Backend source was not modified. Proposed snippets are recommendations, not applied patches.

**Strengths worth preserving:** tenant/brand scope helpers fail closed without a principal; conversation visibility is centralized; role checks distinguish the caller from the target user's role; claim/forward writes include ownership/status conditions; status writes use revisions; settings versions have unique-index conflict handling; cursor pagination uses date plus ObjectId; passwords are hashed and excluded from normal serialization; auth cookies are HttpOnly, production Secure and SameSite Strict; provider requests have explicit timeouts; webhook ingress verifies raw-body HMAC and acknowledges only after enqueue. These mechanisms do not need replacement merely to introduce another architectural layer.

**Critical weaknesses:** authorization is inconsistent in File and over the lifetime of sockets; message deduplication does not cover earlier side effects; session creation is not serialized per conversation; wrap-up history can record an incorrect before-value; provider delivery and local persistence have no recoverable send identity. Read-time reports and append-only embedded histories also have growth limits to plan for.

**Production concerns:** the checked-in Compose recipe lacks a worker and durable local-upload storage. The dependency audit reports affected production dependency versions, including network-facing parsers. Production indexes, actual reverse-proxy topology, deployed worker processes, storage ACLs, traffic distributions and restore procedures were not inspected.

### Scope and verification

The review began with package manifests, lockfiles, app/server/worker entry points, route registration and deployment files. It then traced authentication and tenant access, file upload/listing, conversations and sessions, status/assignment/history, webhook ingestion and queue behavior, provider/media boundaries, settings, reports, logging and tests. This is a risk-prioritized review of major modules, not a claim that every branch of every provider adapter was exhaustively verified.

| Review area | Evidence and conclusion |
| --- | --- |
| Code quality / types | Feature-local schemas and validation help navigation. Large conversation/comment services mix persistence, provider effects and event emission. Some comments now contradict the implementation. Narrow these seams as fixes require them; do not perform a blanket controller/repository rewrite. |
| Architecture / configuration | API and worker are separate processes; deployment does not match that design. Configuration uses Zod, but live secrets and infrastructure were deliberately not inspected. |
| Security | Reviewed auth, role/tenant gates, cookies, upload wiring, webhook signatures and socket subscriptions. Findings below identify concrete exceptions; no SQL layer or request-reachable shell execution was identified in these paths. |
| Database / concurrency | Reviewed indexes, scoped queries, cursor ordering, deduplication and conditional writes. Index declarations are not proof of production index installation. |
| Reliability / queues | Enqueue-before-ACK, bounded producer timeout, retry/backoff and failure retention are present. Partial database/provider operations remain the main recovery gap. |
| API design | Strict input schemas and shared envelopes are generally useful. Removing mergeWithPrevious is a breaking contract change that needs coordinated client rollout. The file APIs are the most serious contract/access exception. |
| Observability | Structured logs, request IDs, queue age/depth and heartbeats exist. Worker jobs do not carry the original HTTP request context; replay/deduplication outcomes need their own event IDs and metrics. |
| Tests | Existing Mongo-backed and mocked suites were run; results are recorded below. Passing tests do not establish production load capacity or eliminate untested interleavings. |

No live provider sends, production database operations, migrations, exploit traffic or load tests were performed. The audit queried package advisory metadata; it did not change dependencies. Severity reflects application impact; advisory severity alone is not an application exploitability verdict.

## 2. Findings

### F01 — Anonymous callers can upload objects and create File records

**Issue:** File upload routes have no authentication or authorization.

**Severity:** High

**Category:** Security

**Location:** `server/src/modules/file/api.ts:82`, `server/src/modules/file/api.ts:119`; mounting: `server/src/modules/file/index.ts:5`.

**Problem:** Both upload routes go directly from logRequest to multipart parsing, S3 upload and database insertion. There is no parent authentication middleware in the module/root registration.

**Impact:** An unauthenticated internet caller can consume API memory, object storage and database capacity. The multiple-file route buffers up to ten files before parallel uploads. MIME/size checks and the global IP limiter reduce individual request size; they do not establish permission or a tenant quota.

**Evidence:** GET /files explicitly authenticates, but POST /files/upload-image-single and /upload-image-multiple do not. uploadedBy assignment is commented out in both create calls. The middleware uses memoryStorage and checks declared/extension MIME types, not ownership.

**Recommended Fix:** Disable unused upload routes, or put authenticate and an explicit allowed-role gate **before upload middleware**. Require an authorized owning company/resource, record uploadedBy and companyId server-side, enforce per-tenant quotas and clean up S3 writes if metadata insertion fails. Keep the existing file count/size limits. Minimal middleware ordering:

```typescript
router.post('/upload-image-single',
  authenticate,
  authorize(...UPLOAD_ROLES), // define the intended callers explicitly
  upload({ allowMultiple: false, fieldName: 'file' }),
  handler);
```

**Confidence:** High — missing middleware is confirmed from the mounted call chain; storage abuse was not executed.

### F02 — Any authenticated role can enumerate the global file inventory

**Issue:** File list omits the tenant boundary.

**Severity:** High

**Category:** Security

**Location:** `server/src/modules/file/api.ts:42`, `server/src/modules/file/api.ts:49`; `server/src/modules/file/schema.ts:7`.

**Problem:** GET /files allows every role and calls QueryBuilder without a mandatory scope. File has no companyId and upload paths do not populate uploadedBy.

**Impact:** A user in one company can enumerate filenames, object keys, sizes, MIME types and other stored metadata created by others. This is confirmed metadata disclosure; private bucket content access is a separate question and was not established.

**Evidence:** The chain is query(FileModel, req.query) → lean → paginate → execute, with no where(getTenantScope(...)) equivalent. Client filters cannot supply a trustworthy ownership boundary.

**Recommended Fix:** Until records have ownership, restrict this legacy inventory to platform administrators or remove it. Introduce required companyId/resource ownership for new records, backfill verifiable owners, quarantine unattributable rows, and enforce tenant scope before pagination. Do not infer ownership from a user-provided key or filename.

**Confidence:** High — query and schema demonstrate the cross-tenant read.

### F03 — Socket room access survives token expiry and revoked access

**Issue:** Socket authentication is only a connection-time decision.

**Severity:** High

**Category:** Security

**Location:** `server/src/libraries/socket/index.ts:31`, `server/src/libraries/socket/index.ts:65`, `server/src/libraries/socket/index.ts:72`.

**Problem:** The handshake verifies a JWT and active company once. The stored principal omits exp. join:brand checks scope at join time; nothing expires the connection or removes existing room membership when the company is suspended, a user is deleted/moved, or brand grants are removed.

**Impact:** An already joined socket can keep receiving customer messages and query updates after its access token expires or an administrator revokes access. HTTP's next-request company check does not protect server-to-room broadcasts.

**Evidence:** initSocket registers join, leave, typing and disconnect handlers, with no expiry timer, periodic authorization check or revocation listener. emitToRoom broadcasts to existing members without rereading their authorization.

**Recommended Fix:** Retain token expiry and disconnect at expiry; require a newly authenticated connection after refresh. Publish authorization-change invalidations across API instances and evict/revalidate affected users' room memberships. Recheck current user/company access when joining. An expiry timer alone does not provide immediate revocation.

**Confidence:** High — the authorization lifetime gap is confirmed; no live data interception was attempted.

### F04 — The documented production stack starts no webhook worker

**Issue:** Deployment omits the queue consumer.

**Severity:** High

**Category:** Reliability

**Location:** `docker-compose.prod.yml:11`; `server/Dockerfile:84`; `server/src/worker.ts:44`; `RELEASE.md:33`.

**Problem:** Production Compose defines app, redis and web. The API image's default command runs app.js; only worker.ts registers webhook processors and starts consumption. The release recipe starts that Compose file without a worker override.

**Impact:** Following the checked-in recipe on a fresh host acknowledges durable webhook jobs but never processes them. Inboxes stop receiving stored messages while the ordinary health endpoint can remain healthy. A separately managed worker could prevent this on the actual host; none is specified by this recipe.

**Evidence:** The API imports queue production/cleanup but does not call startWorker. worker.ts calls registerWebhookHandlers and startWorker. Queue health is separate from /health; the app container healthcheck uses only /health.

**Recommended Fix:** Add a worker service using the same source revision/image, environment and config mount, with command `node dist/src/worker.js`. Give it a worker-specific health/heartbeat check rather than inheriting the API HTTP healthcheck. Set stop_grace_period longer than the worker's 30-second drain deadline and monitor /health/queue. Update the deployment smoke test to verify an enqueued event is consumed.

**Confidence:** High for the supplied deployment recipe; actual host process inventory remains unverified.

### F05 — Local logo storage is neither provisioned nor persisted in production

**Issue:** The container lifecycle does not support saveLocal.

**Severity:** Medium

**Category:** Reliability

**Location:** `server/src/libraries/storage/local.ts:7`, `server/src/libraries/storage/local.ts:34`; `server/Dockerfile:60`, `server/Dockerfile:69`; `docker-compose.prod.yml:30`.

**Problem:** Logos are written under process.cwd()/uploads. The production image creates/chowns logs, then runs as nodejs, but never provisions uploads. Compose mounts config and logs, not uploads.

**Impact:** In the stock image, creating /app/uploads can fail under the non-root user because the parent directory is not made writable. Even if a deployment workaround makes writes succeed, container replacement loses files while Mongo retains their keys. Multiple API containers would have different local logo inventories.

**Evidence:** Brand/company upload callers use saveLocal; only the logs directory receives explicit writable provisioning, and no upload volume appears in either root Compose recipe.

**Recommended Fix:** Prefer the existing object-store abstraction for logos. If retaining local storage, create/chown the directory in the image and mount persistent storage with suitable ownership; define shared-storage behavior before scaling API replicas. Test upload, restart and image replacement.

**Confidence:** High for missing provisioning/persistence; the image was not built or deployed during this review.

### F06 — Duplicate message protection does not protect earlier side effects

**Issue:** Check-then-insert deduplication permits double counting and partial recovery.

**Severity:** High

**Category:** Bug

**Location:** `server/src/modules/conversation/service.ts:371`, `server/src/modules/conversation/service.ts:398`; `server/src/modules/session/service.ts:185`; `server/src/modules/conversation/schema.ts:399`.

**Problem:** The inbound path checks mid, then updates the conversation/unread count and session/message count, and finally inserts Message. Two processors can both pass the initial check. The unique mid index rejects the second message only after both have changed counters. A crash before insertion also leaves earlier writes committed.

**Impact:** Redelivery or parallel jobs can inflate unread/message counts or leave an empty episode. A crash after insertion but before status/SLA effects is also not fully replayed: the duplicate branch returns early rather than finishing those effects. Best-effort SLA errors have no durable repair job here.

**Evidence:** The ordering is findOne(mid) → upsertConversation → assignMessageToSession → Message.create → onMessageStored. These writes do not share a transaction or a persisted completion state. The queue retries whole entries, so this interleaving is realistic even though sequential duplicates are handled.

**Recommended Fix:** Make accepting an event and its database effects atomic on production replica-set MongoDB, or use a unique ingestion receipt with explicit pending/applied state and recoverable idempotent effects. Simply catching E11000 after the existing writes is insufficient. Keep provider mid uniqueness and make retry resume unfinished processing rather than equating “message exists” with “all work completed.”

**Confidence:** High for the race/failure ordering; a forced production interleaving was not executed.

### F07 — Concurrent first messages can create multiple support episodes

**Issue:** New-session selection is not serialized per conversation.

**Severity:** High

**Category:** Bug

**Location:** `server/src/modules/session/service.ts:185`, `server/src/modules/session/service.ts:201`; `server/src/modules/session/schema.ts:428`.

**Problem:** Two different incoming messages can both read no session, or the same resolved latest session, and both create a new pending Session with the same next sequence. No unique conversation/sequence constraint or conversation-level episode revision arbitrates creation.

**Impact:** One customer return can split into two episodes, separating messages, assignments and SLA calculations. Conversation mirroring then selects one latest record, concealing the other from the summary. Unlike F06, this can happen with completely different provider message IDs.

**Evidence:** startNew derives from a prior findOne sorted by latest; Session.create has no conditional dependency on that read. Existing indexes support lookup but do not enforce episode identity.

**Recommended Fix:** Serialize episode selection through a conditional update of a conversation episode/version pointer, preferably in the ingestion transaction. Add an appropriate uniqueness constraint after repairing existing duplicates. Retry a losing creator by reloading the winner; do not merely allocate another sequence number, which still creates an extra episode. Test concurrent incoming messages after resolution and races with wrap-up.

**Confidence:** High — the interleaving follows directly from the read/create sequence.

### F08 — Wrap-up history can record a before-value that was never current

**Issue:** Classification audit comparison is outside the guarded write.

**Severity:** Medium

**Category:** Bug

**Location:** `server/src/modules/session/service.ts:496`, `server/src/modules/session/service.ts:548`; `server/src/modules/comment/service.ts:651`; `server/src/modules/session/status-log.ts:141`.

**Problem:** wrapUpBefore reads fields, wrapUpLogPush computes changes, then another operation writes them. Standalone field edits have no comparison/revision guard. Wrap-up computes the log before entering the status retry loop; a status retry does not recompute those before-values. Same-status writes do not advance statusRevision.

**Impact:** Two editors reading neutral can produce neutral→positive followed by neutral→negative even though the second edit replaced positive. If the second request saves neutral, its stale comparison may produce no log at all while undoing the first change. Managers cannot rely on the history as an accurate sequence of classification changes.

**Evidence:** The same Mongo update correctly combines fields and a log entry, but its filter contains only identity/scope. Atomic field-plus-log storage does not make the earlier comparison atomic.

**Recommended Fix:** Add a shared classification revision to every classification writer. Read values plus revision, calculate the delta, condition the update on that revision and increment it; reread/recompute on conflict. Integrate the same guard into wrap-up/status operations, including same-status edits. Alternatively calculate before-values inside a suitable update pipeline.

**Confidence:** High — confirmed read/write race, not a claim that every history row is wrong.

### F09 — Late messages can move conversation activity backwards

**Issue:** Summary and activity writes are unconditional on event time.

**Severity:** Medium

**Category:** Bug

**Location:** `server/src/modules/conversation/service.ts:309`, `server/src/modules/conversation/service.ts:321`; `server/src/modules/session/service.ts:225`.

**Problem:** A delayed older event overwrites lastMessageAt/text/direction and session lastActivityAt. An older outgoing event also clears unreadCount regardless of a newer incoming event.

**Impact:** A thread can fall down the inbox, display an obsolete preview and lose its waiting-for-response badge. Queue concurrency and provider redelivery make arrival order different from message sentAt order.

**Evidence:** upsertConversation always $sets preview fields and clears unread on outgoing; the existing-session branch always $sets lastActivityAt. Neither compares stored timestamps with the incoming event.

**Recommended Fix:** Update activity with a monotonic maximum. Conditionally update the entire preview tuple only when the event is newer (define an equal-timestamp tie-breaker). Model unread/awaiting-response against an explicit response watermark so an older outgoing event cannot clear newer customer activity. Do not apply $max to the timestamp while still overwriting its associated text.

**Confidence:** High — confirmed ordering behavior; production frequency is unknown.

### F10 — A successful provider send can be repeated after a local failure

**Issue:** Outbound operations lack a durable client request identity.

**Severity:** Medium

**Category:** Reliability

**Location:** `server/src/modules/conversation/api.ts:161`, `server/src/modules/conversation/api.ts:179`, `server/src/modules/conversation/api.ts:274`.

**Problem:** The provider is called before recordOutgoingMessage. If the provider accepts and Mongo persistence fails, or the response is lost, retrying the same HTTP operation sends another message. Deduplication by the newly returned provider message ID cannot identify the original client action.

**Impact:** Customers receive duplicate replies or attachments, and an accepted send can be absent from internal history. This is a partial-failure window, not proof that every retry duplicates a message.

**Evidence:** The send helper obtains sent.messageId and only then creates the local message; there is no request idempotency key or durable outbound intent in the route contract.

**Recommended Fix:** Accept a client-generated idempotency key scoped to company/conversation, persist a unique send intent before contacting the provider, and store dispatch/result state. Reuse completed results on retries. Treat an ambiguous provider timeout as unknown and reconcile by supported provider evidence; do not promise exactly-once delivery when the provider offers no idempotent send guarantee.

**Confidence:** High for the failure window; no external message was sent during review.

### F11 — Logout and password changes do not revoke refresh credentials

**Issue:** Refresh tokens are stateless and replayable until expiry.

**Severity:** Medium

**Category:** Security

**Location:** `server/src/auth/service.ts:154`, `server/src/auth/service.ts:178`; `server/src/auth/api.ts:108`; `server/src/libraries/utils/tokens.ts:63`.

**Problem:** Refresh verifies the signature and reloads the user, then issues another pair without storing/invalidating a refresh identifier. Logout only clears browser cookies. Password changes do not invalidate already minted refresh tokens.

**Impact:** Someone who obtains a refresh token can continue renewing a session after the legitimate user logs out or changes their password, until the presented token expires; successive refreshes can extend the stolen session. Token theft is a prerequisite, not demonstrated by this review.

**Evidence:** Current-user reload correctly prevents deleted users from refreshing and updates role claims, but both login/refresh contain token-store TODOs. No session/token-version check accompanies verification.

**Recommended Fix:** Store hashed refresh identifiers in session families; rotate and invalidate the prior identifier on use, detect replay and revoke the family. Revoke on logout and password reset/change according to product policy. A user authVersion is a smaller first step for password-change revocation, but does not replace per-session logout/reuse handling. Document the remaining access-token validity window.

**Confidence:** High for revocation behavior; exploitability depends on obtaining a token.

### F12 — Production lockfile contains known affected dependency versions

**Issue:** Audit matches include public request-processing dependencies.

**Severity:** High

**Category:** Security

**Location:** `server/pnpm-lock.yaml:3348`, `server/pnpm-lock.yaml:1939`, `server/pnpm-lock.yaml:2921`, `server/pnpm-lock.yaml:1767`, `server/pnpm-lock.yaml:3153`.

**Problem:** A successful production dependency audit returned **39 advisories: 1 critical, 17 high, 19 moderate and 2 low**. This is the scanner's advisory count, not 39 independently demonstrated application exploits.

**Impact:** Socket.IO decoding, multipart parsing and compression are exposed through the server. Known defects in these dependencies can undermine application-level input checks or availability. Other advisories require features or configurations not shown here.

**Evidence:** The audit resolved socket.io-parser 4.2.6, engine.io 6.6.9, multer 2.2.0, compression 1.8.1 and proxy-addr 2.0.7. The maintained [Socket.IO advisory](https://github.com/socketio/socket.io/security/advisories/GHSA-2m8v-j782-fhvr) identifies memory exhaustion in parser versions before 4.2.7. The [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) concerns trust-subnet handling; this app uses a numeric trust-proxy setting, so the critical advisory does **not** establish a critical exploit in this configuration.

**Recommended Fix:** Update and test compatible releases covering the full audit, prioritizing network-facing packages. Verify the resolved transitive lockfile, not just package.json ranges. Audit the built/pruned image too. Move nodemon out of production dependencies if it is only used in development. Review Nodemailer advisories against actual SMTP options: the inspected mail wrapper does not expose arbitrary raw/json transport options from an HTTP body, so those findings are not demonstrated SSRF here. Preserve the audit snapshot at `docs/reviews/listenyzen-2026-10-19-dependency-audit.json` for remediation tracking.

**Confidence:** High for affected-version matches; application exploitability varies and was not penetration-tested.

### F13 — Hold-report limits do not bound database reads or disclose truncation

**Issue:** The report loads all candidate histories before taking 1,000 rows.

**Severity:** Medium

**Category:** Performance

**Location:** `server/src/modules/overview/holds.ts:19`, `server/src/modules/overview/holds.ts:112`, `server/src/modules/overview/holds.ts:123`, `server/src/modules/overview/holds.ts:156`.

**Problem:** Both collections are read without a database limit, mapped into an in-memory combined list, expanded and sorted. MAX_ROWS applies only afterwards. The response is a bare capped array with no continuation/truncated indicator.

**Impact:** A large brand with long histories causes substantial database transfer, heap allocation and sorting despite receiving only 1,000 rows. Managers may treat an incomplete report as complete. This is a confirmed unbounded read pattern; no latency or memory reduction has been measured yet.

**Evidence:** SessionModel.find and CommentModel.find select whole statusLog arrays; found.sort precedes found.slice(0, MAX_ROWS). Date validation bounds the requested range, not candidate count or document size.

**Recommended Fix:** Add explicit hasMore/cursor semantics and move interval selection/ordering toward a bounded query. Preserve next-transition and currently-held overlap semantics when optimizing; taking the first arbitrary 1,000 documents would be incorrect. Start with candidate/row/byte metrics and production-like explain plans, then choose aggregation or a derived interval collection only if needed.

**Confidence:** High for the query shape and silent cap; scale impact depends on data volume.

### F14 — Relay authentication logs disclose part of the expected secret

**Issue:** Debug logging bypasses key-based credential redaction.

**Severity:** Medium

**Category:** Security

**Location:** `server/src/modules/webhook/facebook.ts:617`, `server/src/modules/webhook/facebook.ts:620`; `server/src/libraries/log/logger.ts:53`.

**Problem:** On an invalid relay token, the handler logs expectedPrefix (the first six characters of the configured secret) and its length. The logger redacts keys containing token/secret/etc.; expectedPrefix and expectedLen do not match those rules.

**Impact:** Anyone able to read those logs learns a secret fragment, and unauthenticated failures can cause it to be recorded repeatedly. This is not a full-token disclosure or proof that a high-entropy token can be guessed. It applies only where the optional relay is configured.

**Evidence:** The code explicitly slices expected and received values. The ordinary body allowlist does not affect these direct logger calls.

**Recommended Fix:** Remove both prefixes and lengths; log a fixed authentication-failed reason and request ID. Disable the relay outside the intended environment, inspect access to retained logs and rotate the relay credential if disclosure violates the secret policy. Also avoid logging raw originalUrl where future routes may carry OAuth codes or query credentials.

**Confidence:** High — confirmed secret-fragment logging, conditional on relay configuration.

## 3. Prioritized Findings Table

No application-level Critical finding was established. The audit's critical package advisory is tracked under F12 without automatically assigning P0 to the application.

| Priority | Severity | Issue | File | Recommended Action |
| --- | --- | --- | --- | --- |
| P1 | High | F01 Anonymous uploads | file/api.ts:82 | Authenticate before parsing or remove legacy upload routes. |
| P1 | High | F02 Global file inventory | file/api.ts:49 | Restrict immediately; add verified ownership and tenant scope. |
| P1 | High | F03 Persistent socket access | libraries/socket/index.ts:31 | Expire sockets and propagate authorization revocation. |
| P1 | High | F04 Worker absent from deployment | docker-compose.prod.yml:11 | Add worker and consumption smoke check. |
| P1 | High | F06 Ingestion effects precede deduplication | conversation/service.ts:371 | Atomic acceptance/effects or recoverable event state. |
| P1 | High | F07 Duplicate episodes | session/service.ts:185 | Serialize episode selection and retry conflicts. |
| P1 | High | F12 Affected dependency versions | server/pnpm-lock.yaml:3348 | Patch network-facing dependencies; audit built image. |
| P2 | Medium | F05 Nonpersistent/unprovisioned uploads | server/Dockerfile:69 | Object storage or writable persistent volume. |
| P2 | Medium | F08 Incorrect audit before-values | session/service.ts:496 | Guard and recompute classification deltas. |
| P2 | Medium | F09 Backwards activity/preview | conversation/service.ts:309 | Timestamp-aware tuple update and response watermark. |
| P2 | Medium | F10 Duplicate outbound sends | conversation/api.ts:179 | Durable idempotent send intent and reconciliation. |
| P2 | Medium | F11 Refresh revocation missing | auth/service.ts:154 | Session-family rotation and revocation. |
| P2 | Medium | F13 Unbounded/capped hold report | overview/holds.ts:123 | Bounded reads, continuation and truncation visibility. |
| P2 | Medium | F14 Relay secret fragment logs | webhook/facebook.ts:617 | Remove credential fragments and review retention. |

Paths abbreviated in this table expand to the exact source paths under each finding. Priorities describe remediation order; they do not imply fixes have been applied.

## 4. Performance Improvements

| Opportunity | Expected benefit and tradeoff | How to verify |
| --- | --- | --- |
| Bound hold-report work (F13) | Less transferred history and heap/sort work. A materialized interval model costs extra writes and repair logic; begin with measurement and a bounded query design. | Representative brands/ranges; candidate count, examined keys/documents, returned rows, p95 latency and peak heap; compare interval results exactly. |
| Avoid repeatedly scanning the entire session for SLA | `session/sla.ts:330` reads all message timing fields on each synchronization. Across N sequential messages, cumulative reads approach N(N+1)/2. Coalesced recomputation per session or indexed summaries can reduce work, but must retain late-event and delivery-failure correctness. | Benchmark 50/500/5,000-message sessions; count Mongo reads, worker throughput and clock equivalence under reordered events. Keep the full computation as a repair oracle. |
| Bound embedded-history growth | Session/Comment statusLog, assignmentLog and wrapUpLog append indefinitely. Long-lived comment threads are the clearest growth risk. Archival or separate paginated events reduce hot-document size, but status intervals required by SLA must remain reconstructible. | Track BSON size and entry-count percentiles, update latency and history payload sizes; set an operational threshold before choosing migration. No oversized production document was observed. |
| Limit aggregate media work | Existing limits bound each file and ten files per request, not simultaneous authorized requests across tenants. Tenant concurrency/byte budgets protect memory while preserving throughput. Per-process inFlight media deduplication is already useful; distributed coordination is justified only if duplicate work is measured. | Concurrent mixed-size uploads; RSS, event-loop delay, provider/S3 latency, rejection rate and per-tenant fairness. |
| Verify deployed indexes before adding more | The declared compound cursor indexes match common sort patterns. autoIndex is disabled in production, so missing installation can turn good query shapes into scans. More indexes add write/storage cost. | Inspect production getIndexes through the deployment owner and explain representative brand/filter/cursor queries. Do not assume an index is absent merely because autoIndex is off. |

Do not replace cursor pagination with offset pagination, parallelize all provider loops without bounds, or add caching to authorization decisions without a revocation strategy. Current projection/lean use and batched team counts are appropriate patterns to retain.

## 5. Architecture Recommendations

1. **Make ingestion an explicit consistency boundary.** Keep feature modules, but give event acceptance, episode selection, message insertion and derived effects a defined transaction/recovery contract (F06–F07). A unique mid alone is too narrow a boundary.
2. **Separate provider dispatch from recoverable send state.** Extract a small outbound coordinator around the existing channel adapters (F10). A durable intent is justified; a new microservice is not required.
3. **Share authorization lifetime across HTTP and sockets.** Reuse current scope checks, then add session/revocation state and cross-instance invalidation (F03/F11). Do not cache stale permissions indefinitely for performance.
4. **Consolidate classification writes.** One revision-aware helper for Session and Comment should own before-value comparison and history writes (F08), just as the existing status writer owns transitions.
5. **Align operations with process topology.** API, worker, Redis and storage need explicit deployment/lifecycle checks. Keep the modular monolith and separate worker; there is no evidence that a microservice split would solve these findings.

The Conversation ↔ Session dependency is a concrete coupling point: conversation persistence imports session operations, while session synchronization imports conversation models/effects. Extracting a small orchestration seam can simplify these changes. Do not label all circular imports runtime bugs without demonstrating an initialization failure. Narrow generic any/type assertions when touching QueryBuilder or log payloads, rather than turning this reliability work into a repository-wide typing rewrite.

Additional verification items, not confirmed exploits: errorHandler forwards unknown error.message to clients (`server/src/server.ts:259`), so production should mask unexpected 5xx details while preserving typed 4xx messages; the database plugin's setRunValidators returns an object instead of calling query.setOptions (`server/src/libraries/db/index.ts:54`), and is registered during connection after route/model imports, so do not rely on it as a universal validator guarantee. Prove actual update validation in a focused integration test and use explicit runValidators where appropriate. Strict request schemas remain an independent protection.

## 6. Missing Tests

These are gaps in the inspected scenarios, not a claim that a feature has no tests. Existing claim tests already exercise a competing claim and mirror races; status/history/forward tests already cover normal writes and permission refusals.

| Area | Required regression scenario | Acceptance criterion |
| --- | --- | --- |
| File authorization | Anonymous single/multiple upload; tenant A lists tenant B's records | No upload parsing/provider write for anonymous callers; no cross-tenant metadata. |
| Socket lifetime | Join, then expire token, suspend company, remove brand grant or delete user | No subsequent protected broadcast reaches that socket; reconnect requires current access. |
| Ingestion deduplication | Barrier both workers after the same mid lookup; fail after each intermediate write | Exactly one accepted message, correct counters and episode; retry completes missing effects. |
| Episode creation | Two distinct first messages; two messages after resolved; incoming concurrent with wrap-up | One logically new episode with a defined ordering rule. |
| Event ordering | Persist newer incoming then older outgoing/customer event | Preview/activity never regress; waiting-response state remains correct. |
| Classification audit | Two readers see the same before-value; include a no-op relative to the stale read | Every committed edit has the correct immediately prior value, or returns/retries a conflict. |
| Outbound recovery | Provider accepts, persistence fails; HTTP response is lost; same key retried | Reuse known result and reconcile unknown state; never blindly resend a completed intent. |
| Refresh tokens | Reuse rotated token; logout; password change; concurrent legitimate refreshes | Defined replay handling and revocation with an explicit access-token window. |
| Deployment/storage | Start only documented Compose stack; consume job; upload logo; replace container | Worker consumes and drains; logo remains available; worker healthcheck is not API-only. |
| Reports/growth | More than 1,000 holds, long histories and range-boundary holds | Correct intervals, continuation/truncation indicator, bounded resource use. |
| Validation/errors/logs | Update violating schema; unexpected provider/DB error; failed relay auth | Expected validation fails; generic public 5xx; no credential fragments in logs. |
| Queue durability | Real Redis interruption, timeout during enqueue, stalled/retried job and shutdown | ACK/retry behavior preserves events and monitoring shows backlog/failure. Mock-only tests cannot establish this. |

A coverage threshold in Jest configuration is not a measured coverage result. This review did not run coverage instrumentation or a production-like load test. forceExit in the test configuration can hide leaked resources; a dedicated shutdown/open-handle check should be allowed to terminate naturally.

## 7. Action Plan

### Immediate

Restrict or remove the legacy file APIs; remediate socket expiry/access revocation; correct the production worker recipe; triage and update exposed dependency paths. Confirm whether actual deployments already supply a worker and persistent uploads outside these files. Remove relay credential-fragment logging as a small independent change. These are recommendations; this review applied no backend fix.

### Short-term

Implement ingestion/episode concurrency protection with fault-injection tests, then classification audit guards and event-time-safe summaries. Provision durable logo storage. Add refresh-session revocation and outbound request identity. Give hold reports explicit pagination/truncation and measure their query cost. Add deployment acceptance checks and validate the installed index inventory.

### Long-term

Use measured session/thread sizes to decide whether SLA coalescing, archived histories or a derived reporting model are warranted. Add durable repair/outbox processing for derived state and notifications where loss is unacceptable. Introduce narrow orchestration seams while fixing the identified workflows; keep the existing module organization and working access/status primitives.

### Review evidence

| Check | Result and limitation |
| --- | --- |
| Full backend Jest run | **55 suites passed, 1 failed; 640 tests passed, 3 failed (643 total).** Failures were in claim.test.ts: session unassignment expected 200/got 403; conversation routing denial encountered socket hang up; reply-root claim expected 200/got 404. |
| Focused claim-suite rerun | **35/35 passed.** The first failures were not reproduced. Their root cause remains unconfirmed; this is not a clean full-suite pass or proof of an application regression. Investigate test/server lifecycle and repeat under the original conditions before accepting the gate. |
| Production dependency audit | Completed against registry metadata: **39 advisories** (1 critical, 17 high, 19 moderate, 2 low). Affected-version matches are confirmed; exploitability is assessed separately in F12. |
| Backend TypeScript check | `pnpm run type-check` passed. |
| Backend source integrity | Working tree remained clean after inspection/tests. No fixes, migrations, dependency upgrades or live requests were applied. |
| Runtime scope | Tests used temporary local MongoDB and the suite's existing mocks. The sandbox initially blocked the database listener; the completed run used permission to open local ports. Actual Redis/provider failure simulations and deployment were not run. |

Commands, from the Listenyzen server directory (log/report paths were under /tmp):

```sh
LOG_TO_FILE=false pnpm exec jest --runInBand --reporters=default \
  --cacheDirectory=/tmp/listenyzen-review-jest --json \
  --outputFile=/tmp/listenyzen-review-tests.json
LOG_TO_FILE=false pnpm exec jest test/claim.test.ts --runInBand \
  --reporters=default --cacheDirectory=/tmp/listenyzen-review-jest --json \
  --outputFile=/tmp/listenyzen-review-claim-rerun.json
pnpm audit --prod --json
pnpm run type-check
```

A portable test summary is saved in `docs/reviews/listenyzen-2026-10-19-test-summary.json`; dependency evidence is in the adjacent audit JSON. Recheck source locations and advisory status when applying fixes to a later revision.

[Download this review as Markdown](/downloads/LISTENYZEN_BACKEND_REVIEW.md).
