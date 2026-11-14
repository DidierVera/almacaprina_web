-- One-time: names, details and texts from "Alma Caprina — Textos de productos" (second version, with the facts you confirmed).
-- Left out on purpose: the days a product keeps once opened (queso fresco, ricotta, yogurt griego), which the document
-- still asks you to confirm. If you confirm them, add them to "Conservación" from the panel.
-- Safe to run more than once. Needs supabase/schema.sql to have been run first (new columns).

-- Cuajada
update public.products set
  detail = '250 g · cuajada artesanal',
  description = 'Suave y fresco, el clásico con arepa y bocadillo.',
  long_description = 'Cuajada hecha a mano con leche de cabra, al estilo tradicional. Tiene sabor suave y limpio, y una textura húmeda que se deshace en la boca. Es el compañero de siempre para el desayuno: con arepa caliente, bocadillo o melao.',
  ideal_for = 'Desayunos, arepas, con bocadillo, melao o panela, ensaladas.',
  storage = 'Refrigerado entre 2 y 6 °C, en su empaque.'
where id = 'fresh-cheese';

-- Ricotta (id aged-cheese comes from the first seed; the customer never sees it)
update public.products set
  detail = '250 g · artesanal',
  description = 'Ligera y suave, para pastas, rellenos y postres.',
  long_description = 'Ricotta de leche de cabra, de sabor delicado y textura blanda y granulada. Es muy versátil: se unta, se mezcla o se hornea. Pruébala en lasaña, canelones, tortas, panqueques o en tostadas con fruta y miel.',
  ideal_for = 'Cocina italiana, rellenos de pasta, postres, ensaladas, desayunos.',
  storage = 'Refrigerada y bien tapada.'
where id = 'aged-cheese';

update public.products set
  detail = '250 g · artesanal',
  description = 'Cremoso y untable, para arepas, galletas y sándwiches.',
  long_description = 'Queso fresco untable de leche de cabra, suave, cremoso y con un punto ácido muy agradable. Se esparce fácil incluso recién sacado de la nevera. Va bien en arepas, galletas, sándwiches y wraps, o como base para dips y salsas.',
  ideal_for = 'Desayunos, picadas, dips con hierbas, cheesecake.',
  storage = 'Refrigerado y bien tapado; usa siempre una cuchara limpia.'
where id = 'queso-crema';

update public.products set
  detail = '200 g · artesanal',
  description = 'Cremoso y con carácter, delicioso gratinado con miel.',
  long_description = 'Queso de cabra en forma de rollo, de pasta cremosa y con el sabor más marcado de la casa. En frío se corta en rodajas; al calor se dora por fuera y queda fundente por dentro. Pruébalo gratinado con miel y nueces, en tostadas o sobre una ensalada tibia.',
  ideal_for = 'Tostadas, ensaladas, picadas con vino, pizzas, al horno con miel.',
  storage = 'Refrigerado y bien envuelto. Para servir en frío, sácalo 15 minutos antes.'
where id = 'queso-rulo';

update public.products set
  detail = '250 g · en salmuera',
  description = 'Salado y desmoronable, perfecto para ensaladas.',
  long_description = 'Feta de leche de cabra conservado en salmuera, de sabor intenso y salado con un punto ácido. Tiene textura firme pero cremosa, y se desmorona fácil con los dedos. Es el queso de la ensalada griega y queda muy bien en pastas, quiches, verduras asadas o al horno con tomate.',
  ideal_for = 'Ensaladas, pastas, verduras asadas, picadas.',
  storage = 'Refrigerado y siempre cubierto por su salmuera.'
where id = 'queso-feta';

-- Lácteos
update public.products set
  detail = '1 litro · pasteurizada',
  description = 'Fresca y nutritiva, directo de nuestras cabras.',
  long_description = 'Leche de cabra pasteurizada, de sabor suave y ligeramente dulce. Viene de nuestras cabras en Montebello, Antioquia, que viven en aprisco y salen a pastorear algunas horas cada día. No lleva conservantes. Muchas personas la sienten más liviana que la de vaca, y aporta calcio y proteína de forma natural.',
  ideal_for = 'Tomarla sola, café, chocolate, batidos, recetas.',
  storage = 'Siempre refrigerada. Agitar antes de servir. Una vez abierta, consumir en 2 a 3 días.'
where id = 'goat-milk';

update public.products set
  name = 'Yogurt griego de cabra',
  detail = '500 g · sin azúcar',
  description = 'Espeso, cremoso y alto en proteína. Sin azúcar.',
  long_description = 'Yogurt colado de leche de cabra, más espeso y cremoso que un yogurt tradicional. No lleva azúcar ni conservantes: su sabor es natural, fresco y ligeramente ácido. Aporta proteína, calcio y probióticos, y es ideal para toda la familia, deportistas y quienes cuidan su alimentación.',
  ideal_for = 'Con granola y fruta, smoothies, salsas tipo tzatziki, en lugar de crema agria.',
  storage = 'Refrigerado y bien tapado.'
where id = 'greek-yogurt';

update public.products set
  detail = '1 litro · con mora',
  description = 'Con mora de verdad, cremoso y refrescante.',
  long_description = 'Yogurt bebible de leche de cabra con mora, de color intenso y sabor entre dulce y ácido. Es cremoso, fácil de tomar, sin conservantes y con cultivos lácticos y probióticos. Viene en litro para compartir en casa.',
  ideal_for = 'Desayunos, loncheras, media tarde, después de entrenar.',
  storage = 'Refrigerado. Agitar antes de servir.'
where id = 'yogurt-bebible-de-mora';

update public.products set
  detail = '1 litro · con fresa',
  description = 'Suave y dulce, el favorito de los niños.',
  long_description = 'Yogurt bebible de leche de cabra con fresa, de sabor suave y dulce que gusta a grandes y pequeños. Es cremoso, nutritivo, sin conservantes y con cultivos lácticos y probióticos. Perfecto para el desayuno o la lonchera.',
  ideal_for = 'Desayunos, loncheras, media tarde, después de entrenar.',
  storage = 'Refrigerado. Agitar antes de servir.'
where id = 'yogurt-bebible-de-fresa';

update public.products set
  detail = '1 litro · mezcla de frutos rojos',
  description = 'Frutal y con un toque ácido, mezcla de frutos rojos.',
  long_description = 'Yogurt bebible de leche de cabra con una mezcla de frutos rojos, frutal y con un toque ácido muy refrescante. Es cremoso, sin conservantes y con cultivos lácticos y probióticos. Para tomar frío a cualquier hora.',
  ideal_for = 'Desayunos, loncheras, media tarde, después de entrenar.',
  storage = 'Refrigerado. Agitar antes de servir.'
where id = 'yogurt-bebible-frutos-rojos';

update public.products set
  detail = '1 litro · con miel 100 % pura',
  description = 'Endulzado solo con miel pura. Sin azúcar añadida.',
  long_description = 'Yogurt bebible de leche de cabra endulzado únicamente con miel pura, sin azúcar añadida y sin conservantes. Tiene sabor suave, natural y redondo, y trae cultivos lácticos y probióticos. Es para quien quiere algo dulce, pero más natural.',
  ideal_for = 'Desayunos, media tarde, después de entrenar.',
  storage = 'Refrigerado. Agitar antes de servir. No apto para menores de 1 año, por la miel.'
where id = 'yogurt-bebible-de-miel';

-- De la finca
update public.products set
  name = 'Trucha arcoíris deshuesada',
  detail = '1 kg · 3 a 5 truchas · congelada',
  description = 'Limpia, deshuesada y congelada, lista para cocinar.',
  long_description = 'Paquete de 1 kg con 3 a 5 truchas arcoíris, evisceradas, deshuesadas y congeladas, listas para la sartén sin trabajo extra. Su carne es rosada, suave y jugosa, y aporta proteína y omega 3. Queda deliciosa a la plancha, al horno con limón y hierbas o en salsa de ajo.',
  ideal_for = 'Almuerzos rápidos, al horno, a la plancha, en papillote.',
  storage = 'Mantener congelada. Descongelar en la nevera la noche anterior y no volver a congelar.'
where id = 'trucha-arcoiris-deshuesada';

update public.products set
  detail = '30 unidades · de nuestra finca',
  description = 'De nuestras gallinas: yema intensa y mucho sabor.',
  long_description = 'Huevos frescos de las gallinas de nuestra finca. La diferencia se nota en la cocina: yema de color intenso, clara firme y más sabor. Elige el tamaño que prefieras: A, los más económicos, ideales para recetas y repostería; AA, el tamaño del día a día; AAA, los más grandes, para desayunos generosos.',
  ideal_for = 'Desayunos, repostería, cocina diaria.',
  storage = 'En un lugar fresco o en la nevera. No lavarlos hasta el momento de usarlos.'
where id like 'canasta-de-huevos%';

update public.products set
  detail = 'Pollo entero · pelado, eviscerado y congelado',
  description = 'Criado natural, carne firme y sabor de campo.',
  long_description = 'Pollo campesino criado a ritmo natural, con carne más firme y el sabor de antes. Llega entero, pelado, eviscerado, congelado y empacado al vacío. Eliges el peso y escogemos el pollo más cercano a ese peso. Perfecto para sancocho, al horno o guisado.',
  ideal_for = 'Sancocho, asado al horno, guisos, caldos.',
  storage = 'Mantener congelado. Descongelar en la nevera, cocinar en 1 a 2 días y no volver a congelar.'
where id like 'country-chicken-%';
