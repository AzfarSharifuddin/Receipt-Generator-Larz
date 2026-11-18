BEGIN;
CREATE TABLE IF NOT EXISTS larz.invoice_payments (
 id uuid PRIMARY KEY,
 invoice_id uuid NOT NULL REFERENCES larz.documents(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=9007199254740991),
 currency text NOT NULL CHECK(currency IN ('MYR','USD')),
 paid_on date NOT NULL,
 actor uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON larz.invoice_payments(invoice_id);
ALTER TABLE larz.invoice_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON larz.invoice_payments FROM PUBLIC,anon,authenticated;
COMMIT;
