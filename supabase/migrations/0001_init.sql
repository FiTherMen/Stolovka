-- Онлайн Столовка: початкова схема бази даних.
-- Запускати один раз у Supabase → SQL Editor (весь файл цілком).

create extension if not exists pgcrypto;

-- ───────────────────────── Довідники ─────────────────────────

create type public.user_role as enum ('customer', 'chef', 'admin');
create type public.chef_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner');
create type public.order_status as enum ('new', 'accepted', 'cooking', 'ready', 'delivered', 'cancelled');
create type public.fulfillment as enum ('delivery', 'pickup');

-- Налаштування платформи: один рядок з id = 1.
-- Години вікон і дедлайни замовлення — значення за замовчуванням, власник змінює їх в адмінці.
create table public.settings (
  id int primary key default 1 check (id = 1),
  platform_fee_percent numeric(5, 2) not null default 10,
  max_days_ahead int not null default 7,
  timezone text not null default 'Europe/Madrid',
  -- cutoff_days_before: 0 = того ж дня, 1 = напередодні
  slots jsonb not null default '{
    "breakfast": {"label": "Сніданок", "window_start": "08:30", "window_end": "09:00", "cutoff_time": "21:00", "cutoff_days_before": 1, "enabled": true},
    "lunch":     {"label": "Обід",     "window_start": "13:30", "window_end": "14:00", "cutoff_time": "10:00", "cutoff_days_before": 0, "enabled": true},
    "dinner":    {"label": "Вечеря",   "window_start": "20:00", "window_end": "20:30", "cutoff_time": "16:00", "cutoff_days_before": 0, "enabled": true}
  }'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.buildings (name, address) values ('Наш будинок', 'Barcelona');

-- ───────────────────────── Користувачі ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  telegram_id bigint unique,
  telegram_username text,
  building_id uuid references public.buildings (id),
  apartment text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Кухар: профіль, який бачать клієнти. Новий кухар чекає схвалення адміністратора.
create table public.chefs (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null,
  bio text,
  photo_url text,
  phone text,
  building_id uuid references public.buildings (id),
  status public.chef_status not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- Приватні дані кухаря для Telegram-сповіщень (не видно клієнтам).
create table public.chef_telegram (
  chef_id uuid primary key references public.chefs (id) on delete cascade,
  chat_id bigint,
  link_token uuid not null default gen_random_uuid(),
  linked_at timestamptz
);

create or replace function public.chef_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.status := 'pending';
      new.approved_at := null;
    end if;
  elsif new.status is distinct from old.status then
    if not public.is_admin() then
      raise exception 'Лише адміністратор може змінювати статус кухаря';
    end if;
    if new.status = 'approved' then
      new.approved_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger chefs_before_write
  before insert or update on public.chefs
  for each row execute function public.chef_before_write();

create or replace function public.chef_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.chef_telegram (chef_id) values (new.id) on conflict do nothing;
  update public.profiles set role = 'chef' where id = new.id and role = 'customer';
  return new;
end $$;

create trigger chefs_after_insert
  after insert on public.chefs
  for each row execute function public.chef_after_insert();

-- ───────────────────────── Страви ─────────────────────────

-- Алергени: ключі 14 алергенів ЄС (Регламент 1169/2011), підписи — у застосунку.
create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  chef_id uuid not null references public.chefs (id) on delete cascade,
  name text not null,
  description text,
  category text,
  photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 5),
  price_cents int not null check (price_cents >= 0),
  weight_g int check (weight_g > 0),
  volume_ml int check (volume_ml > 0),
  portion_note text,
  kcal numeric(7, 1),
  protein_g numeric(6, 1),
  fat_g numeric(6, 1),
  carbs_g numeric(6, 1),
  ingredients text[] not null default '{}',
  allergens text[] not null default '{}',
  tags text[] not null default '{}',
  storage_note text,
  slots public.meal_slot[] not null default '{lunch,dinner}',
  daily_limit int check (daily_limit > 0),
  is_active boolean not null default true,
  is_hidden boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dishes_chef_idx on public.dishes (chef_id);

create or replace function public.dish_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.is_hidden is distinct from old.is_hidden and not public.is_admin() then
    raise exception 'Лише адміністратор може приховувати страви';
  end if;
  return new;
end $$;

create trigger dishes_before_update
  before update on public.dishes
  for each row execute function public.dish_before_update();

-- ───────────────────────── Замовлення ─────────────────────────

-- Одне оформлення кошика створює окреме замовлення для кожного кухаря (спільний checkout_id),
-- щоб кожен кухар вів статус лише своєї частини.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  checkout_id uuid not null,
  customer_id uuid not null references public.profiles (id),
  chef_id uuid not null references public.chefs (id),
  building_id uuid references public.buildings (id),
  apartment text not null,
  customer_name text not null,
  phone text,
  comment text,
  delivery_date date not null,
  slot public.meal_slot not null,
  fulfillment public.fulfillment not null default 'delivery',
  status public.order_status not null default 'new',
  payment_method text not null default 'cash',
  paid boolean not null default false,
  total_cents int not null,
  platform_fee_percent numeric(5, 2) not null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_chef_date_idx on public.orders (chef_id, delivery_date);
create index orders_customer_idx on public.orders (customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  dish_id uuid references public.dishes (id) on delete set null,
  dish_name text not null,
  price_cents int not null,
  qty int not null check (qty > 0 and qty <= 50)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_dish_idx on public.order_items (dish_id);

-- ───────────────────────── Відгуки ─────────────────────────

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items (id) on delete cascade,
  dish_id uuid not null references public.dishes (id) on delete cascade,
  chef_id uuid not null references public.chefs (id) on delete cascade,
  customer_id uuid not null references public.profiles (id),
  author_name text,
  rating int not null check (rating between 1 and 5),
  body text,
  chef_reply text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_dish_idx on public.reviews (dish_id);

create view public.dish_ratings with (security_invoker = true) as
  select dish_id, round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as reviews_count
  from public.reviews where not is_hidden group by dish_id;

create view public.chef_ratings with (security_invoker = true) as
  select chef_id, round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as reviews_count
  from public.reviews where not is_hidden group by chef_id;

-- ───────────────────────── Логіка ─────────────────────────

-- Момент, після якого замовлення на дату/вікно вже не приймаються (за часом платформи).
create or replace function public.slot_cutoff(p_date date, p_slot public.meal_slot) returns timestamptz
language sql stable set search_path = public as $$
  select ((p_date - coalesce((s.slots -> p_slot::text ->> 'cutoff_days_before')::int, 0))
          + (s.slots -> p_slot::text ->> 'cutoff_time')::time) at time zone s.timezone
  from public.settings s where s.id = 1;
$$;

-- Скільки порцій страви вже замовлено на дату (для денного ліміту).
create or replace function public.dish_sold(p_dish_id uuid, p_date date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(oi.qty), 0)::int
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.dish_id = p_dish_id and o.delivery_date = p_date and o.status <> 'cancelled';
$$;

-- Оформлення кошика. p_items: [{"dish_id": "...", "qty": 2}, ...]
-- Повертає id створених замовлень (по одному на кухаря).
create or replace function public.place_order(
  p_date date,
  p_slot public.meal_slot,
  p_items jsonb,
  p_customer_name text,
  p_phone text,
  p_apartment text,
  p_comment text default null,
  p_fulfillment public.fulfillment default 'delivery',
  p_building_id uuid default null
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

  if not coalesce((v_settings.slots -> p_slot::text ->> 'enabled')::boolean, true) then
    raise exception 'Це вікно зараз не працює';
  end if;
  if p_date < v_today or p_date > v_today + v_settings.max_days_ahead then
    raise exception 'На цю дату замовити не можна';
  end if;
  if now() > public.slot_cutoff(p_date, p_slot) then
    raise exception 'Замовлення на це вікно вже закрите';
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
                               phone, comment, delivery_date, slot, fulfillment, total_cents, platform_fee_percent)
    values (v_checkout, v_uid, v_chef, v_building, trim(p_apartment), trim(p_customer_name),
            nullif(trim(p_phone), ''), nullif(trim(p_comment), ''), p_date, p_slot, p_fulfillment,
            v_total, v_settings.platform_fee_percent)
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

-- Зміна статусу кухарем (або адміністратором).
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_paid boolean default null)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or (v_order.chef_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Замовлення не знайдено';
  end if;
  update public.orders
     set status = p_status, paid = coalesce(p_paid, paid), updated_at = now()
   where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

-- Клієнт скасовує своє замовлення, поки кухар його не прийняв і вікно ще відкрите.
create or replace function public.cancel_my_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if not found then
    raise exception 'Замовлення не знайдено';
  end if;
  if v_order.status <> 'new' or now() > public.slot_cutoff(v_order.delivery_date, v_order.slot) then
    raise exception 'Скасувати вже не можна, напишіть кухарю';
  end if;
  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
end $$;

-- Відгук: лише на страву з власного виданого замовлення, один раз.
create or replace function public.leave_review(p_order_item_id uuid, p_rating int, p_body text default null)
returns public.reviews
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_review public.reviews;
begin
  select oi.id, oi.dish_id, o.chef_id, o.customer_id, o.status, o.customer_name into v_row
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;
  if not found or v_row.customer_id <> auth.uid() then
    raise exception 'Можна оцінити лише страву зі свого замовлення';
  end if;
  if v_row.status <> 'delivered' then
    raise exception 'Оцінити можна після отримання замовлення';
  end if;
  if v_row.dish_id is null then
    raise exception 'Цієї страви вже немає в меню';
  end if;
  insert into public.reviews (order_item_id, dish_id, chef_id, customer_id, author_name, rating, body)
  values (p_order_item_id, v_row.dish_id, v_row.chef_id, v_row.customer_id,
          split_part(coalesce(v_row.customer_name, ''), ' ', 1), p_rating, nullif(trim(p_body), ''))
  returning * into v_review;
  return v_review;
end $$;

create or replace function public.reply_to_review(p_review_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.reviews set chef_reply = nullif(trim(p_reply), '')
   where id = p_review_id and (chef_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'Відгук не знайдено';
  end if;
end $$;

-- Звіт для адміністратора: продажі кожного кухаря за місяць і відсоток платформи (лише видані).
create or replace function public.sales_report(p_month date) returns table (
  chef_id uuid, display_name text, orders_count int, revenue_cents int, fee_cents int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.display_name, count(o.id)::int,
         coalesce(sum(o.total_cents), 0)::int,
         coalesce(sum(round(o.total_cents * o.platform_fee_percent / 100)), 0)::int
  from public.chefs c
  left join public.orders o on o.chef_id = c.id and o.status = 'delivered'
    and o.delivery_date >= date_trunc('month', p_month)::date
    and o.delivery_date < (date_trunc('month', p_month) + interval '1 month')::date
  where public.is_admin() or c.id = auth.uid()
  group by c.id, c.display_name
  order by 4 desc;
$$;

-- ───────────────────────── Правила доступу (RLS) ─────────────────────────

alter table public.settings enable row level security;
alter table public.buildings enable row level security;
alter table public.profiles enable row level security;
alter table public.chefs enable row level security;
alter table public.chef_telegram enable row level security;
alter table public.dishes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;

create policy "settings: read all" on public.settings for select using (true);
create policy "settings: admin edits" on public.settings for update using (public.is_admin());

create policy "buildings: read all" on public.buildings for select using (true);
create policy "buildings: admin manages" on public.buildings for all using (public.is_admin()) with check (public.is_admin());

create policy "profiles: own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles: edit own" on public.profiles for update using (id = auth.uid());
create policy "profiles: admin edits" on public.profiles for update using (public.is_admin());

-- Роль і Telegram-привʼязку змінює лише адміністратор або сервер.
create or replace function public.profile_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.telegram_id := old.telegram_id;
  end if;
  return new;
end $$;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profile_before_update();

create policy "chefs: approved are public" on public.chefs for select
  using (status = 'approved' or id = auth.uid() or public.is_admin());
create policy "chefs: register self" on public.chefs for insert with check (id = auth.uid());
create policy "chefs: edit own" on public.chefs for update using (id = auth.uid() or public.is_admin());

create policy "chef_telegram: own" on public.chef_telegram for select using (chef_id = auth.uid() or public.is_admin());

create policy "dishes: public menu" on public.dishes for select using (
  (is_active and not is_hidden and exists (select 1 from public.chefs c where c.id = chef_id and c.status = 'approved'))
  or chef_id = auth.uid() or public.is_admin()
);
create policy "dishes: chef inserts own" on public.dishes for insert with check (chef_id = auth.uid());
create policy "dishes: chef edits own" on public.dishes for update using (chef_id = auth.uid() or public.is_admin());
create policy "dishes: chef deletes own" on public.dishes for delete using (chef_id = auth.uid() or public.is_admin());

create policy "orders: customer, chef or admin" on public.orders for select
  using (customer_id = auth.uid() or chef_id = auth.uid() or public.is_admin());

create policy "order_items: via order" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id
          and (o.customer_id = auth.uid() or o.chef_id = auth.uid() or public.is_admin()))
);

create policy "reviews: public" on public.reviews for select
  using (not is_hidden or customer_id = auth.uid() or chef_id = auth.uid() or public.is_admin());
create policy "reviews: admin moderates" on public.reviews for update using (public.is_admin());

-- Список страв дня з залишком порцій (для меню).
create or replace function public.dishes_left(p_date date) returns table (dish_id uuid, left_count int)
language sql stable security definer set search_path = public as $$
  select d.id, greatest(d.daily_limit - public.dish_sold(d.id, p_date), 0)
  from public.dishes d where d.daily_limit is not null and d.is_active;
$$;

-- ───────────────────────── Фото страв ─────────────────────────

insert into storage.buckets (id, name, public) values ('dish-photos', 'dish-photos', true)
on conflict (id) do nothing;

create policy "dish photos: public read" on storage.objects for select
  using (bucket_id = 'dish-photos');
create policy "dish photos: chef uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dish photos: chef deletes own" on storage.objects for delete to authenticated
  using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);
