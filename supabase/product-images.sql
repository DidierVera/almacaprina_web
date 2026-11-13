-- One-time: point existing products at the photos shipped in /images/products (served by the site itself).
-- Root-relative paths work on any domain. Photos uploaded later from the admin panel replace these.
update public.products set image_url = '/images/products/curd-cheese.jpg'          where id = 'fresh-cheese';
update public.products set image_url = '/images/products/goat-milk.jpg'            where id = 'goat-milk';
update public.products set image_url = '/images/products/cream-cheese.jpg'        where id = 'queso-crema';
update public.products set image_url = '/images/products/yogurt-blackberry.jpg'    where id = 'yogurt-bebible-de-mora';
update public.products set image_url = '/images/products/yogurt-mixed-berries.jpg' where id in ('yogurt-bebible-frutos-rojos', 'yogurt-bebible-de-fresa');
-- Ready for products you create later (set via the panel or here):
--   /images/products/rulo-cheese.jpg   /images/products/feta-cheese.jpg   /images/products/ricotta-cheese.jpg
