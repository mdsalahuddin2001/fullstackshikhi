\set ON_ERROR_STOP on
SET search_path TO handbook;
DO $$
BEGIN
 IF (SELECT count(*) FROM customers) <> 4 THEN RAISE EXCEPTION 'Expected 4 customers'; END IF;
 IF (SELECT sum(i.quantity*i.unit_price) FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.status='paid') <> 4800 THEN RAISE EXCEPTION 'Expected revenue 4800'; END IF;
 IF (SELECT count(*) FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id)) <> 1 THEN RAISE EXCEPTION 'Expected one customer without orders'; END IF;
 IF (SELECT sum(balance) FROM accounts) <> 1500 THEN RAISE EXCEPTION 'Expected total balance 1500'; END IF;
END $$;
SELECT 'Seed checks passed' AS result;
