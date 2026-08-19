-- ============================================================
-- BURMELIN — Re-enable Row Level Security
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- ⚠️  RUN THIS LAST.
--
-- Do not run it until you have:
--   1. Set ADMIN_PASSWORD and SUPABASE_SERVICE_KEY in Netlify
--   2. Deployed the new admin-api function
--   3. Signed into the admin panel and confirmed products and
--      orders still load
--
-- Running it earlier will lock the admin panel out of the database.
--
-- ------------------------------------------------------------
-- WHY
--
-- supabase-fix.sql previously disabled RLS on both tables. Because the
-- database key was also published inside admin.html, anyone could read
-- and write every row - including customer names, phones, addresses and
-- emails in `orders`.
--
-- The key is no longer in the browser. This restores the second layer:
-- even if a key leaks, the database itself refuses public access to
-- orders and to hidden products.
--
-- ------------------------------------------------------------
-- WHO NEEDS WHAT AFTER THIS RUNS
--
--   get-products.js    anon key    SELECT active products      → allowed below
--   create-checkout.js service key SELECT all products         → bypasses RLS
--   save-order.js      service key INSERT orders               → bypasses RLS
--   get-session.js     service key SELECT/UPDATE orders        → bypasses RLS
--   stripe-webhook.js  service key SELECT/UPDATE orders        → bypasses RLS
--   admin-api.js       service key everything                  → bypasses RLS
--
-- The service_role key bypasses RLS entirely, so only the anon path needs
-- an explicit policy. Confirm SUPABASE_SERVICE_KEY in Netlify really is
-- the service_role key from Supabase → Settings → API, not the
-- publishable/anon one, or the functions above will start failing.

-- ── PRODUCTS ────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Clear any earlier policies so this script is safe to re-run.
DROP POLICY IF EXISTS "Public read active products" ON products;
DROP POLICY IF EXISTS "Admin full access products"  ON products;

-- The storefront reads active products through get-products.js (anon key).
-- Hidden products stay invisible to the public.
CREATE POLICY "Public read active products"
  ON products FOR SELECT
  TO anon
  USING (active = true);

-- ── ORDERS ──────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public insert orders"     ON orders;
DROP POLICY IF EXISTS "Admin full access orders" ON orders;

-- No anon policy at all: with RLS on and no policy, the public key can do
-- nothing to this table. Every legitimate path uses the service key.

-- ── VERIFY ──────────────────────────────────────────────────
-- Both should report rowsecurity = true
SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname = 'public' AND tablename IN ('products', 'orders');

-- Should list exactly one policy: Public read active products
SELECT tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('products', 'orders');
