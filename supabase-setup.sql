-- ============================================================
-- BURMELIN — Supabase Setup
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  price       numeric NOT NULL DEFAULT 0,
  description text,
  cat         text,
  img         text,
  stock       integer DEFAULT 0,
  active      boolean DEFAULT true,
  code        text,
  colors      jsonb DEFAULT '[]',
  sizes       jsonb DEFAULT '[]',
  badge       text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      text,
  customer_name text DEFAULT '',
  phone         text DEFAULT '',
  address       text DEFAULT '',
  items         jsonb DEFAULT '[]',
  total         numeric DEFAULT 0,
  status        text DEFAULT 'Pending',
  date          text,
  created_at    timestamptz DEFAULT now()
);

-- Allow anyone to read active products (for the store)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active products"
  ON products FOR SELECT USING (active = true);

-- Allow service_role (admin) full access to products
CREATE POLICY "Admin full access products"
  ON products FOR ALL USING (true);

-- Allow anyone to insert orders (customers placing orders)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert orders"
  ON orders FOR INSERT WITH CHECK (true);

-- Allow service_role (admin) full access to orders
CREATE POLICY "Admin full access orders"
  ON orders FOR ALL USING (true);
