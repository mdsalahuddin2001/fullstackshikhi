\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS handbook;
SET search_path TO app;
CREATE TABLE customers (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL,
 email text NOT NULL UNIQUE,
 city text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL UNIQUE,
 parent_id integer REFERENCES categories(id)
);
CREATE TABLE products (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 category_id integer NOT NULL REFERENCES categories(id),
 name text NOT NULL,
 price numeric(12,2) NOT NULL CHECK (price >= 0),
 stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
 attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE orders (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 customer_id integer NOT NULL REFERENCES customers(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_items (
 order_id integer REFERENCES orders(id) ON DELETE CASCADE,
 product_id integer REFERENCES products(id),
 quantity integer NOT NULL CHECK (quantity > 0),
 unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
 PRIMARY KEY (order_id, product_id)
);
CREATE TABLE accounts (
 id integer PRIMARY KEY,
 balance numeric(12,2) NOT NULL CHECK (balance >= 0),
 version integer NOT NULL DEFAULT 0
);
INSERT INTO customers(name,email,city) VALUES
 ('Amina','amina@example.test','Dhaka'),
 ('Rafi','rafi@example.test','Chattogram'),
 ('Nila','nila@example.test',NULL),
 ('Sami','sami@example.test','Dhaka');
INSERT INTO categories(name,parent_id) VALUES ('Electronics',NULL),('Books',NULL),('Accessories',1);
INSERT INTO products(category_id,name,price,stock,attributes) VALUES
 (1,'Keyboard',1200,10,'{"color":"black","wireless":false}'),
 (3,'Mouse',600,5,'{"color":"black","wireless":true}'),
 (2,'SQL Book',800,20,'{"language":"en"}'),
 (3,'USB Cable',200,0,'{"color":"white"}');
INSERT INTO orders(customer_id,status,created_at) VALUES
 (1,'paid','2026-01-10T10:00:00Z'),
 (2,'paid','2026-01-11T10:00:00Z'),
 (1,'pending','2026-02-10T10:00:00Z'),
 (3,'paid','2026-02-12T10:00:00Z');
INSERT INTO order_items VALUES (1,1,1,1200),(1,2,2,600),(2,3,1,800),(3,1,1,1200),(4,3,2,800);
INSERT INTO accounts VALUES (1,1000,0),(2,500,0);
COMMIT;
