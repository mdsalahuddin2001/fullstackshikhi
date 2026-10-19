# PostgreSQL reservation API lab

A local learning service: Node.js 22+, PostgreSQL 17+, and `pg`. The complete lesson is `/docs/postgresql-handbook/api-project` in the handbook site.

## Local containers

```sh
docker compose up --build -d
curl http://localhost:3100/health
curl -i http://localhost:3100/reservations \
  -H 'Authorization: Bearer local-learning-token' \
  -H 'Idempotency-Key: checkout-1' \
  -H 'Content-Type: application/json' \
  --data '{"productId":1,"quantity":2}'
```

Repeat the reservation to replay its stored response. Change the quantity while keeping the key to receive 409. Stop with `docker compose down`; the named data volume remains.

## Node and an existing PostgreSQL

Create a dedicated database, set `DATABASE_URL` and `LAB_API_TOKEN`, then:

```sh
npm ci
npm run migrate
npm start
```

The default bind is 127.0.0.1:3100. `PORT` and `HOST` override it. Migration 1 is applied transactionally once; repeated migration commands skip it.

## Tests

Create a separate database whose name ends in `_test`. Point DATABASE_URL to it, run migrations, then `npm test`. Tests start their own ephemeral HTTP server and RESET the reservation_lab fixtures. Never use a shared database. The suite exercises duplicate concurrent requests, last-unit races, invalid/authenticated inputs, and rollback when an outbox constraint fails.

## Contract and limitations

Import `openapi.json` into your API client. Only one server-configured actor exists; the token is a local teaching credential, not a user authentication system. Successful idempotency results are retained indefinitely; failed transactions do not retain keys. Outbox rows record intent but are not published anywhere. The Compose database uses an administrator and disposable credentials. Before any real exposure, implement identity/authorization, separate roles, TLS, managed secrets, backup/restore, and an operational rollout appropriate to your environment.
