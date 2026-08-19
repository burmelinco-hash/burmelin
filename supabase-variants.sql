-- ============================================================
-- BURMELIN — Per-variant availability
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- Adds a `variants` column holding availability for each
-- colour + size combination of a product.
--
-- Shape:
--   {
--     "Navy":  { "S": false, "L": false },
--     "Black": { "M": false }
--   }
--
-- Rules:
--   * A key that is MISSING means the variant is AVAILABLE.
--   * Only an explicit `false` marks a variant sold out.
--   * Products with no colours use "" as the colour key.
--   * Products with no sizes   use "" as the size key.
--
-- Because missing means available, every existing product stays
-- fully in stock after this runs. No backfill is needed.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variants jsonb DEFAULT '{}'::jsonb;

-- Existing rows get NULL rather than the default; normalise them
-- so the column is always a JSON object.
UPDATE products SET variants = '{}'::jsonb WHERE variants IS NULL;
