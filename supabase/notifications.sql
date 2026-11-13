-- Order notifications: when an order becomes complete (create_order's final UPDATE sets total > 0),
-- call the `notify-order` Edge Function. Idempotent. Run after schema.sql.
--
-- BEFORE running, store two secrets in Supabase Vault (SQL editor), with your real values:
--   select vault.create_secret('https://qwqbxbenshjthfkllwgf.supabase.co/functions/v1/notify-order', 'notify_order_url');
--   select vault.create_secret('<same value as the WEBHOOK_SECRET function secret>', 'notify_order_secret');
-- Never put the real secret in this file.

create extension if not exists pg_net;

create or replace function public.notify_new_order()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_url    text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_order_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_order_secret');
begin
  if v_url is null or v_secret is null then return new; end if;  -- not configured: never block an order
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object('order_id', new.id)
  );
  return new;
exception when others then
  return new;  -- a notification failure must never break order creation
end;
$$;

drop trigger if exists orders_notify on public.orders;
create trigger orders_notify
  after update of total on public.orders
  for each row
  when (old.total = 0 and new.total > 0)
  execute function public.notify_new_order();
