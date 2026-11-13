-- =====================================================================
-- DEV ONLY — DESTRUCTIVE. Deletes every Alma Caprina table, function and
-- storage policy created by schema.sql, INCLUDING ALL ORDERS AND PRODUCTS.
-- Use it only while the project holds sample data, then run schema.sql again.
-- (Your Auth users are NOT touched; you will need to re-add yourself to `admins`.)
-- Order matters: storage policies depend on is_admin(), so they go first.
-- =====================================================================

-- 1. Storage policies (they reference public.is_admin())
drop policy if exists "proofs: cualquiera sube" on storage.objects;
drop policy if exists "proofs: admin lee" on storage.objects;
drop policy if exists "products: lectura pública" on storage.objects;
drop policy if exists "products: admin gestiona" on storage.objects;
drop policy if exists "proofs: anyone uploads" on storage.objects;
drop policy if exists "proofs: admin read" on storage.objects;
drop policy if exists "product images: public read" on storage.objects;
drop policy if exists "product images: admin manage" on storage.objects;

-- 2. Tables (this also drops their own policies and the price trigger)
drop table if exists public.order_items, public.orders, public.price_history,
                     public.products, public.settings, public.admins cascade;
drop sequence if exists public.order_seq;

-- 3. Functions
drop function if exists public.create_order(jsonb);
drop function if exists public.get_order_status(uuid);
drop function if exists public.top_products(integer);
drop function if exists public.next_delivery_date(timestamptz);
drop function if exists public.log_price_change();
drop function if exists public.is_admin();
