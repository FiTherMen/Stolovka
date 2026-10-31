-- Страви «під замовлення» (торти на будь-яку дату, поза сніданком/обідом/вечерею) і публічна сторінка кухаря.
-- Виконати після 0003. Безпечно повторювати.

-- Нове «вікно» custom: страва зі slots = {custom} не показується в сніданку/обіді/вечері,
-- клієнт обирає для неї дату (і бажаний час) сам.
alter type public.meal_slot add value if not exists 'custom';

alter table public.orders add column if not exists desired_time text;

-- Адреса сторінки кухаря: /chef/<slug>.
alter table public.chefs add column if not exists slug text;
update public.chefs set slug = 'chef-' || left(replace(id::text, '-', ''), 8) where slug is null;
alter table public.chefs alter column slug set not null;
alter table public.chefs alter column slug set default ('chef-' || left(replace(gen_random_uuid()::text, '-', ''), 8));
do $$ begin
  alter table public.chefs add constraint chefs_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$');
exception when duplicate_object then null; end $$;
create unique index if not exists chefs_slug_key on public.chefs (slug);

-- Оформлення: нова версія з p_desired_time і датами для «під замовлення».
drop function if exists public.place_order(date, public.meal_slot, jsonb, text, text, text, text, public.fulfillment, uuid);
create or replace function public.place_order(
  p_date date,
  p_slot public.meal_slot,
  p_items jsonb,
  p_customer_name text,
  p_phone text,
  p_apartment text,
  p_comment text default null,
  p_fulfillment public.fulfillment default 'delivery',
  p_building_id uuid default null,
  p_desired_time text default null
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.settings;
  v_today date;
  v_checkout uuid := gen_random_uuid();
  v_building uuid;
  v_order_ids uuid[] := '{}';
  v_chef uuid;
  v_order uuid;
  v_item record;
  v_dish public.dishes;
  v_total int;
begin
  if v_uid is null then
    raise exception 'Потрібно увійти, щоб оформити замовлення';
  end if;
  if coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_apartment), '') = '' then
    raise exception 'Вкажіть імʼя та номер квартири';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Кошик порожній';
  end if;

  select * into v_settings from public.settings where id = 1;
  v_today := (now() at time zone v_settings.timezone)::date;

  if p_slot::text = 'custom' then
    -- Під замовлення (торти тощо): будь-яка дата від завтра до 60 днів; мінімум днів перевіряє тригер позицій.
    if p_date <= v_today or p_date > v_today + 60 then
      raise exception 'Оберіть дату від завтра до 60 днів наперед';
    end if;
  else
    if not coalesce((v_settings.slots -> p_slot::text ->> 'enabled')::boolean, true) then
      raise exception 'Це вікно зараз не працює';
    end if;
    if p_date < v_today or p_date > v_today + v_settings.max_days_ahead then
      raise exception 'На цю дату замовити не можна';
    end if;
    if now() > public.slot_cutoff(p_date, p_slot) then
      raise exception 'Замовлення на це вікно вже закрите';
    end if;
  end if;

  v_building := coalesce(p_building_id, (select id from public.buildings where is_active order by created_at limit 1));

  -- Перевіряємо страви і групуємо за кухарями.
  create temp table _cart (dish_id uuid, chef_id uuid, name text, price_cents int, qty int) on commit drop;
  for v_item in
    select (e ->> 'dish_id')::uuid as dish_id, sum((e ->> 'qty')::int)::int as qty
    from jsonb_array_elements(p_items) e group by 1
  loop
    select d.* into v_dish from public.dishes d join public.chefs c on c.id = d.chef_id
    where d.id = v_item.dish_id and d.is_active and not d.is_hidden and c.status = 'approved';
    if not found then
      raise exception 'Страва недоступна, оновіть меню';
    end if;
    if not (p_slot = any (v_dish.slots)) then
      raise exception 'Страву «%» не готують на це вікно', v_dish.name;
    end if;
    if v_item.qty is null or v_item.qty <= 0 or v_item.qty > 50 then
      raise exception 'Неправильна кількість для «%»', v_dish.name;
    end if;
    if v_dish.daily_limit is not null
       and public.dish_sold(v_dish.id, p_date) + v_item.qty > v_dish.daily_limit then
      raise exception 'Страви «%» на цей день лишилось %', v_dish.name,
        greatest(v_dish.daily_limit - public.dish_sold(v_dish.id, p_date), 0);
    end if;
    insert into _cart values (v_dish.id, v_dish.chef_id, v_dish.name, v_dish.price_cents, v_item.qty);
  end loop;

  for v_chef in select distinct chef_id from _cart loop
    select sum(price_cents * qty)::int into v_total from _cart where chef_id = v_chef;
    insert into public.orders (checkout_id, customer_id, chef_id, building_id, apartment, customer_name,
                               phone, comment, delivery_date, slot, fulfillment, total_cents, platform_fee_percent,
                               desired_time)
    values (v_checkout, v_uid, v_chef, v_building, trim(p_apartment), trim(p_customer_name),
            nullif(trim(p_phone), ''), nullif(trim(p_comment), ''), p_date, p_slot, p_fulfillment,
            v_total, v_settings.platform_fee_percent, left(nullif(trim(p_desired_time), ''), 40))
    returning id into v_order;
    insert into public.order_items (order_id, dish_id, dish_name, price_cents, qty)
      select v_order, dish_id, name, price_cents, qty from _cart where chef_id = v_chef;
    v_order_ids := v_order_ids || v_order;
  end loop;

  -- Запамʼятовуємо контакти для наступних замовлень.
  update public.profiles
     set full_name = trim(p_customer_name), phone = coalesce(nullif(trim(p_phone), ''), phone),
         apartment = trim(p_apartment), building_id = v_building
   where id = v_uid;

  return v_order_ids;
end $$;

notify pgrst, 'reload schema';
