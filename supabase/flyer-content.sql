-- One-time: prices and short descriptions taken from the printed flyer.
-- (Yogurt "miel", the eggs A/AA and the chicken sizes are not in the flyer: their prices stay as they are.)

-- Prices from the flyer
update public.products set price = 20000 where id = 'aged-cheese';    -- ricotta
update public.products set price = 28000 where id = 'queso-crema';
update public.products set price = 28000 where id = 'queso-rulo';
update public.products set price = 28000 where id = 'queso-feta';

-- Descriptions (the flyer's own wording)
update public.products set description = 'Fresca, nutritiva y fácil de digerir'                           where id = 'goat-milk';
update public.products set description = 'Deliciosa con la arepa, bocadillo o melao'                      where id = 'fresh-cheese';
update public.products set description = 'Natural, frutos rojos, fresa y mora, cremoso con probióticos'   where variant_group = 'Yogurt bebible';
update public.products set description = 'Espeso, alto en proteína y natural'                             where id = 'greek-yogurt';
update public.products set description = 'Salado, suave y perfecto para ensaladas'                        where id = 'queso-feta';
update public.products set description = 'Cremoso, ideal para tostadas o gratinado con miel'              where id = 'queso-rulo';
update public.products set description = 'Suave y cremoso para untar en arepa, galleta o sándwiches'      where id = 'queso-crema';
update public.products set description = 'Sabor suave y textura blanda'                                   where id = 'aged-cheese';
update public.products set description = 'Fresca, limpia y lista para preparar'                           where id = 'trucha-arcoiris-deshuesada';
update public.products set description = 'Criado natural, sabor auténtico. Se vende entero: escogemos el pollo más cercano al peso que elijas.' where id like 'country-chicken-%';
update public.products set description = 'De campo, mejor sabor y calidad'                                where id like 'canasta-de-huevos%';
