CREATE SCHEMA reservation_lab;
CREATE TABLE reservation_lab.products (
 id integer PRIMARY KEY,
 name text NOT NULL,
 stock integer NOT NULL CHECK (stock >= 0)
);
CREATE TABLE reservation_lab.reservations (
 id uuid PRIMARY KEY,
 actor_id text NOT NULL,
 product_id integer NOT NULL REFERENCES reservation_lab.products(id),
 quantity integer NOT NULL CHECK (quantity > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reservation_lab.requests (
 actor_id text NOT NULL,
 request_key text NOT NULL,
 payload jsonb NOT NULL,
 response jsonb,
 PRIMARY KEY(actor_id,request_key)
);
CREATE TABLE reservation_lab.outbox (
 id uuid PRIMARY KEY,
 reservation_id uuid NOT NULL UNIQUE REFERENCES reservation_lab.reservations(id),
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz
);
INSERT INTO reservation_lab.products VALUES (1,'Keyboard',10),(2,'Last mouse',1);
