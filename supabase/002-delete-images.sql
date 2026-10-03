BEGIN;
ALTER TABLE larz.products ADD COLUMN IF NOT EXISTS image text NOT NULL DEFAULT '' CHECK(length(image)<=140000);
ALTER TABLE larz.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE larz.documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMIT;
