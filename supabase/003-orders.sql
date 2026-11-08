BEGIN;
ALTER TABLE larz.products ADD COLUMN IF NOT EXISTS public_order boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS larz.orders (
 id uuid PRIMARY KEY,
 submission_id uuid NOT NULL UNIQUE,
 payload_hash text NOT NULL,
 reference text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 data jsonb NOT NULL,
 document_id uuid UNIQUE REFERENCES larz.documents(id),
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 processed_by uuid REFERENCES auth.users(id)
);
ALTER TABLE larz.documents ADD COLUMN IF NOT EXISTS order_id uuid UNIQUE REFERENCES larz.orders(id);
CREATE INDEX IF NOT EXISTS orders_status_date ON larz.orders(status,created_at DESC);
CREATE TABLE IF NOT EXISTS larz.order_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
ALTER TABLE larz.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE larz.order_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON larz.orders,larz.order_limits FROM PUBLIC,anon,authenticated;
COMMIT;
