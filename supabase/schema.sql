-- =====================================================================
-- Alma Caprina · Supabase schema (v1)
-- Run the whole file in: Supabase → SQL Editor → New query → Run.
-- It is idempotent (safe to run again), EXCEPT for changed CHECK constraints:
-- if you ran an older version, run supabase/reset.sql first (dev only, wipes data).
--
-- Security in one line: the public can only READ products/settings and CREATE orders
-- through create_order(), which recomputes prices, shipping and delivery date on the server.
-- Orders are visible to the admin only.
--
-- create_order() raises stable English error codes (e.g. 'EMPTY_ORDER');
-- the front end maps them to Spanish text in js/messages.js.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Admins
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists "admins: read own row" on public.admins;
create policy "admins: read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. Products and price history
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id         text primary key check (id ~ '^[a-z0-9-]+$'),
  name       text not null check (char_length(name) between 1 and 120),
  detail     text not null default '',
  price      integer not null check (price >= 0),
  category   text not null default 'other',
  image_url  text,
  active     boolean not null default true,
  featured   boolean not null default false,
  sort       integer not null default 0,
  variant_group text,                   -- optional: products sharing a group show as ONE card with a variant selector
  variant_label text,                   -- e.g. 'Mora' (required whenever variant_group is set)
  description text,                     -- optional: a short paragraph shown on the Products page
  nutrition   text,                     -- optional: one "Nutrient: value" line per row, shown on the Products page
  created_at timestamptz not null default now()
);

-- Idempotent upgrade for projects created before product descriptions existed.
alter table public.products add column if not exists description text;
alter table public.products add column if not exists nutrition text;

-- Idempotent upgrade for projects created before product variants existed.
alter table public.products add column if not exists variant_group text;
alter table public.products add column if not exists variant_label text;
do $$
begin
  alter table public.products add constraint products_variant_pair check (
    (variant_group is null) = (variant_label is null)
    and (variant_group is null or (char_length(btrim(variant_group)) between 1 and 80
                                   and char_length(btrim(variant_label)) between 1 and 60))
  );
exception when duplicate_object then null;
end $$;

alter table public.products enable row level security;

drop policy if exists "products: public read" on public.products;
create policy "products: public read" on public.products
  for select to anon, authenticated using (active or public.is_admin());

drop policy if exists "products: admin manage" on public.products;
create policy "products: admin manage" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.price_history (
  id         bigint generated always as identity primary key,
  product_id text not null references public.products (id) on delete cascade,
  old_price  integer,
  new_price  integer not null,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid()
);
alter table public.price_history enable row level security;

drop policy if exists "price_history: admin read" on public.price_history;
create policy "price_history: admin read" on public.price_history
  for select to authenticated using (public.is_admin());

create or replace function public.log_price_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.price_history (product_id, old_price, new_price) values (new.id, null, new.price);
  elsif new.price is distinct from old.price then
    insert into public.price_history (product_id, old_price, new_price) values (new.id, old.price, new.price);
  end if;
  return new;
end;
$$;

drop trigger if exists products_price_log on public.products;
create trigger products_price_log
  after insert or update of price on public.products
  for each row execute function public.log_price_change();

-- ---------------------------------------------------------------------
-- 3. Settings (delivery calendar, shipping, payments, business)
--    Same shape as SEED_CONFIG in js/data/seed.js.
--    Everything here is PUBLIC (customers read it): never store secrets.
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

drop policy if exists "settings: public read" on public.settings;
create policy "settings: public read" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "settings: admin manage" on public.settings;
create policy "settings: admin manage" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Orders
-- ---------------------------------------------------------------------
create sequence if not exists public.order_seq;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint not null default nextval('public.order_seq'),
  number         text generated always as ('AC-' || lpad(seq::text, 4, '0')) stored,
  token          uuid not null default gen_random_uuid(),   -- unguessable tracking-link token
  created_at     timestamptz not null default now(),
  status         text not null default 'received'
                   check (status in ('received','confirmed','preparing','out_for_delivery','delivered','cancelled')),

  customer_name  text not null,
  customer_phone text not null,
  customer_email text,
  address        text not null,
  neighborhood   text not null,
  city           text,                                       -- municipality, used to find the address on the map
  notes          text,
  lat            double precision not null,
  lng            double precision not null,
  km             numeric(6,1) not null,
  hub            text,                                       -- starting point the fee was measured from
  consent_at     timestamptz,                                -- when the customer authorized the processing of personal data
  consent_version text,                                      -- which version of the policy they accepted

  delivery_date  date not null,
  route_position integer,                                    -- stop order within that day's route

  subtotal       integer not null default 0,
  shipping_fee   integer not null default 0,
  total          integer not null default 0,

  payment_method text not null check (payment_method in ('transfer','cash_on_delivery','online')),
  payment_status text not null default 'pending'
                   check (payment_status in ('pending','under_review','paid','rejected')),
  proof_path     text,                                       -- path inside the private "proofs" bucket

  unique (seq), unique (token)
);
alter table public.orders add column if not exists city text;  -- for databases created before the municipality field existed
alter table public.orders add column if not exists hub text;   -- for databases created before hubs existed
alter table public.orders add column if not exists consent_at timestamptz;
alter table public.orders add column if not exists consent_version text;
create index if not exists orders_delivery_idx on public.orders (delivery_date, route_position);
create index if not exists orders_phone_idx on public.orders (customer_phone, created_at);

create table if not exists public.order_items (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id text references public.products (id) on delete set null,
  name       text not null,       -- name/price copied at purchase time
  unit_price integer not null,
  qty        integer not null check (qty between 1 and 20)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.orders, public.order_items from anon;

drop policy if exists "orders: admin read" on public.orders;
create policy "orders: admin read" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "orders: admin update" on public.orders;
create policy "orders: admin update" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order_items: admin read" on public.order_items;
create policy "order_items: admin read" on public.order_items for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Delivery calendar (server-side logic). Mirrors js/delivery.js.
-- ---------------------------------------------------------------------
create or replace function public.next_delivery_date(p_now timestamptz default now())
returns date
language plpgsql stable
set search_path = public
as $$
declare
  sch      jsonb := (select value from public.settings where key = 'schedule');
  local_ts timestamp := p_now at time zone 'America/Bogota';
  start_d  date := (p_now at time zone 'America/Bogota')::date;
  cutoff   integer := nullif(sch->>'cutoffHour', '')::integer;
  i        integer;
  d        date;
  monday   date;
  days     jsonb;
begin
  if sch is null then return null; end if;
  if cutoff is not null and extract(hour from local_ts) >= cutoff then
    start_d := start_d + 1;
  end if;

  for i in 1..60 loop
    d := start_d + i;                                    -- never the same day
    if coalesce(sch->'blocked', '[]'::jsonb) ? to_char(d, 'YYYY-MM-DD') then continue; end if;
    if coalesce(sch->'extra',   '[]'::jsonb) ? to_char(d, 'YYYY-MM-DD') then return d; end if;
    monday := d - (extract(isodow from d)::integer - 1);
    days := coalesce(sch->'weeks'->(to_char(monday, 'YYYY-MM-DD')), sch->'defaultDays');
    if days @> to_jsonb(extract(dow from d)::integer) then return d; end if;   -- 0 = Sunday
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. create_order: the ONLY way the public creates orders
--    payload = {
--      customer: {name, phone, email, address, neighborhood, notes},
--      items:    [{id, qty}],
--      delivery: {lat, lng, km},
--      payment:  {method: 'transfer'|'cash_on_delivery', proofPath}
--    }
-- ---------------------------------------------------------------------
create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c       jsonb := payload->'customer';
  dlv     jsonb := payload->'delivery';
  pay     jsonb := payload->'payment';
  ship    jsonb := (select value from public.settings where key = 'shipping');
  pays    jsonb := (select value from public.settings where key = 'payments');

  v_name  text := left(btrim(coalesce(c->>'name', '')), 80);
  v_phone text := btrim(coalesce(c->>'phone', ''));
  v_email text := left(btrim(coalesce(c->>'email', '')), 120);
  v_addr  text := left(btrim(coalesce(c->>'address', '')), 140);
  v_hood  text := left(btrim(coalesce(c->>'neighborhood', '')), 80);
  v_city  text := left(btrim(coalesce(c->>'city', '')), 80);
  v_notes text := left(btrim(coalesce(c->>'notes', '')), 300);

  v_method text := pay->>'method';
  v_proof  text := nullif(pay->>'proofPath', '');

  v_hub   jsonb;
  v_hub_label text;
  v_surcharge integer;
  o_lat   double precision;
  o_lng   double precision;
  v_lat   double precision;
  v_lng   double precision;
  v_hav   numeric;
  v_km    numeric;
  v_fee   integer;
  v_date  date;

  v_order public.orders;
  it      jsonb;
  p       public.products;
  v_qty   integer;
  v_sub   integer := 0;
begin
  if ship is null or pays is null then raise exception 'STORE_NOT_CONFIGURED'; end if;

  -- Customer
  if char_length(v_name) < 2 then raise exception 'INVALID_NAME'; end if;
  if v_phone !~ '^[0-9+ ]{10,16}$' then raise exception 'INVALID_PHONE'; end if;
  if v_email <> '' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if v_addr = '' or v_hood = '' then raise exception 'INVALID_ADDRESS'; end if;

  -- Authorization to process personal data (Ley 1581 de 2012): required, and recorded with the policy version.
  if coalesce((payload->'consent'->>'accepted')::boolean, false) is not true then raise exception 'CONSENT_REQUIRED'; end if;

  -- Items
  if coalesce(jsonb_typeof(payload->'items'), '') <> 'array'
     or jsonb_array_length(payload->'items') not between 1 and 30 then
    raise exception 'EMPTY_ORDER';
  end if;

  -- Payment
  if v_method = 'transfer' then
    if not coalesce((pays->'transfer'->>'enabled')::boolean, false) then raise exception 'PAYMENT_UNAVAILABLE'; end if;
    if v_proof is null or v_proof !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' then
      raise exception 'PROOF_REQUIRED';
    end if;
  elsif v_method = 'cash_on_delivery' then
    if not coalesce((pays->'cashOnDelivery'->>'enabled')::boolean, false) then raise exception 'PAYMENT_UNAVAILABLE'; end if;
    v_proof := null;
  else
    raise exception 'PAYMENT_UNAVAILABLE';
  end if;

  -- Location and shipping. The server does not trust the browser's km:
  -- it clamps it between the straight-line distance and twice that distance.
  v_lat := (dlv->>'lat')::double precision;
  v_lng := (dlv->>'lng')::double precision;
  if v_lat is null or v_lng is null or abs(v_lat) > 90 or abs(v_lng) > 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;
  -- The starting point is the hub closest in a straight line (settings.shipping.hubs, or the single `origin`).
  select s.hub into v_hub
    from (
      select e.hub,
             6371 * 2 * asin(sqrt(
               power(sin(radians(v_lat - (e.hub->>'lat')::double precision) / 2), 2)
               + cos(radians((e.hub->>'lat')::double precision)) * cos(radians(v_lat))
                 * power(sin(radians(v_lng - (e.hub->>'lng')::double precision) / 2), 2)
             )) as dist
        from jsonb_array_elements(
               case when jsonb_typeof(ship->'hubs') = 'array' and jsonb_array_length(ship->'hubs') > 0
                    then ship->'hubs' else jsonb_build_array(ship->'origin') end
             ) as e(hub)
    ) s
   order by s.dist
   limit 1;
  o_lat := (v_hub->>'lat')::double precision;
  o_lng := (v_hub->>'lng')::double precision;
  v_hub_label := left(coalesce(v_hub->>'label', ''), 80);
  v_surcharge := coalesce((v_hub->>'surcharge')::integer, 0);
  v_hav := (6371 * 2 * asin(sqrt(
             power(sin(radians(v_lat - o_lat) / 2), 2)
             + cos(radians(o_lat)) * cos(radians(v_lat)) * power(sin(radians(v_lng - o_lng) / 2), 2)
           )))::numeric;
  v_km := round(least(greatest(coalesce((dlv->>'km')::numeric, v_hav * 1.35), v_hav), v_hav * 2), 1);

  if v_km > (ship->>'maxKm')::numeric then
    raise exception 'OUT_OF_COVERAGE';
  end if;

  select (t->>'fee')::integer into v_fee
    from jsonb_array_elements(ship->'tiers') t
   where (t->>'upToKm')::numeric >= v_km
   order by (t->>'upToKm')::numeric limit 1;
  if v_fee is null then
    select (t->>'fee')::integer into v_fee
      from jsonb_array_elements(ship->'tiers') t
     order by (t->>'upToKm')::numeric desc limit 1;
  end if;
  v_fee := v_fee + v_surcharge;

  v_date := public.next_delivery_date();
  if v_date is null then raise exception 'NO_DELIVERY_DATE'; end if;

  -- Anti-abuse: at most 5 orders per phone per hour
  if (select count(*) from public.orders
       where customer_phone = v_phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_MANY_ORDERS';
  end if;

  insert into public.orders (customer_name, customer_phone, customer_email, address, neighborhood, city, notes,
                             lat, lng, km, hub, consent_at, consent_version, delivery_date, shipping_fee, payment_method, payment_status, proof_path)
  values (v_name, v_phone, nullif(v_email, ''), v_addr, v_hood, nullif(v_city, ''), nullif(v_notes, ''),
          v_lat, v_lng, v_km, nullif(v_hub_label, ''), now(), left(coalesce(payload->'consent'->>'version', ''), 20), v_date, v_fee, v_method,
          case when v_method = 'transfer' then 'under_review' else 'pending' end, v_proof)
  returning * into v_order;

  for it in select * from jsonb_array_elements(payload->'items') loop
    v_qty := (it->>'qty')::integer;
    if v_qty is null or v_qty not between 1 and 20 then raise exception 'INVALID_QUANTITY'; end if;
    select * into p from public.products where id = it->>'id' and active;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    insert into public.order_items (order_id, product_id, name, unit_price, qty)
    values (v_order.id, p.id, p.name, p.price, v_qty);
    v_sub := v_sub + p.price * v_qty;
  end loop;

  update public.orders set subtotal = v_sub, total = v_sub + v_fee where id = v_order.id;

  return jsonb_build_object(
    'number', v_order.number, 'token', v_order.token, 'deliveryDate', v_date,
    'subtotal', v_sub, 'shippingFee', v_fee, 'total', v_sub + v_fee, 'km', v_km,
    'paymentStatus', v_order.payment_status
  );
end;
$$;

-- Public order tracking by token (never by the sequential number)
create or replace function public.get_order_status(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'paymentStatus', o.payment_status,
    'deliveryDate', o.delivery_date, 'total', o.total,
    'shippingFee', o.shipping_fee, 'paymentMethod', o.payment_method,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unitPrice', i.unit_price)), '[]'::jsonb)
                from public.order_items i where i.order_id = o.id)
  )
  from public.orders o where o.token = p_token;
$$;

-- "Most ordered": aggregated figures only, last 90 days
create or replace function public.top_products(p_limit integer default 4)
returns table (product_id text, units bigint)
language sql stable security definer
set search_path = public
as $$
  select i.product_id, sum(i.qty)::bigint as units
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where o.created_at > now() - interval '90 days' and o.status <> 'cancelled' and i.product_id is not null
   group by i.product_id
   order by units desc
   limit least(greatest(p_limit, 1), 20);
$$;

revoke all on function public.create_order(jsonb), public.get_order_status(uuid), public.top_products(integer) from public;
grant execute on function public.create_order(jsonb), public.get_order_status(uuid), public.top_products(integer),
                          public.next_delivery_date(timestamptz), public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Storage: payment proofs (private) and product images (public)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('proofs',   'proofs',   false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('products', 'products', true,  2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "proofs: anyone uploads" on storage.objects;
create policy "proofs: anyone uploads" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'proofs');

drop policy if exists "proofs: admin read" on storage.objects;
create policy "proofs: admin read" on storage.objects
  for select to authenticated using (bucket_id = 'proofs' and public.is_admin());

drop policy if exists "product images: public read" on storage.objects;
create policy "product images: public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'products');

drop policy if exists "product images: admin manage" on storage.objects;
create policy "product images: admin manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Seed data (SAMPLE: edited later from the admin panel).
--    Names/details are customer-facing content, so they stay in Spanish.
-- ---------------------------------------------------------------------
insert into public.products (id, name, detail, price, category, featured, sort) values
  ('fresh-cheese',   'Queso de cabra fresco',   '250 g · artesanal',      18000, 'cheese', true,  1),
  ('aged-cheese',    'Queso de cabra madurado', '250 g · 60 días',        24000, 'cheese', false, 2),
  ('goat-milk',      'Leche de cabra',          '1 litro · pasteurizada',  9000, 'dairy',  false, 3),
  ('greek-yogurt',   'Yogur griego de cabra',   '500 g · sin azúcar',     12000, 'dairy',  true,  4),
  ('dulce-de-leche', 'Arequipe de cabra',       '250 g · tradicional',    14000, 'dairy',  false, 5),
  ('goat-milk-soap', 'Jabón de leche de cabra', '120 g · avena y miel',   10000, 'care',   false, 6)
on conflict (id) do nothing;

insert into public.settings (key, value) values
  ('business', '{"name":"Alma Caprina","whatsapp":"","instagram":"almacaprina.co"}'),
  ('schedule', '{"defaultDays":[2,4,6],"weeks":{},"blocked":[],"extra":[],"cutoffHour":null}'),
  ('shipping', '{"origin":{"lat":6.0911,"lng":-75.6358,"label":"Caldas (Variante)"},"maxKm":40,"roadFactor":1.35,
                "tiers":[{"upToKm":5,"fee":5000},{"upToKm":10,"fee":8000},{"upToKm":20,"fee":12000},{"upToKm":40,"fee":18000}]}'),
  ('payments', '{"transfer":{"enabled":true,"holder":"Alma Caprina","accounts":[{"label":"Nequi","value":"300 000 0000"},{"label":"Bancolombia ahorros","value":"000-000000-00"}]},
                "online":{"enabled":false},"cashOnDelivery":{"enabled":true}}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 9. Becoming an admin (do this AFTER creating your user)
--    Supabase → Authentication → Users → Add user (email + password),
--    then run this with YOUR email:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'YOUR_EMAIL@example.com';
-- ---------------------------------------------------------------------
