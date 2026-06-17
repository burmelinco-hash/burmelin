-- Run this in Supabase → SQL Editor → New Query
-- Disables row-level security so the publishable key can read/write everything

ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders   DISABLE ROW LEVEL SECURITY;
