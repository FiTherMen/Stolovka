-- Штучні страви і страви «під замовлення заздалегідь» (торти тощо).
-- Виконати один раз після 0001_init.sql. Безпечно повторювати.

alter table public.dishes
  add column if not exists unit text not null default 'portion' check (unit in ('portion', 'piece')),
  add column if not exists lead_days int not null default 0 check (lead_days between 0 and 7);

comment on column public.dishes.unit is 'portion = порція, piece = штука';
comment on column public.dishes.lead_days is 'За скільки днів до видачі треба замовити (0 = як звичайно, за дедлайном вікна)';

-- Час дня, до якого приймаються замовлення «заздалегідь» (за N днів до видачі).
alter table public.settings
  add column if not exists advance_cutoff_time time not null default '21:00';

alter table public.order_items
  add column if not exists unit text not null default 'portion';

-- Дедлайн для конкретної страви: найраніший з дедлайну вікна і «за N днів до 21:00».
create or replace function public.dish_cutoff(p_dish_id uuid, p_date date, p_slot public.meal_slot) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
    when d.lead_days > 0 then least(public.slot_cutoff(p_date, p_slot),
                                    ((p_date - d.lead_days) + s.advance_cutoff_time) at time zone s.timezone)
    else public.slot_cutoff(p_date, p_slot)
  end
  from public.dishes d, public.settings s
  where d.id = p_dish_id and s.id = 1;
$$;

-- Перевірка при оформленні: place_order вставляє позиції, тригер копіює одиницю і перевіряє дедлайн страви.
create or replace function public.order_item_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_dish public.dishes;
begin
  if new.dish_id is null then return new; end if;
  select * into v_dish from public.dishes where id = new.dish_id;
  if not found then return new; end if;
  new.unit := v_dish.unit;
  select * into v_order from public.orders where id = new.order_id;
  if v_dish.lead_days > 0 and now() > public.dish_cutoff(v_dish.id, v_order.delivery_date, v_order.slot) then
    raise exception 'Страву «%» треба замовляти за % дн. наперед. Оберіть пізнішу дату.', v_dish.name, v_dish.lead_days;
  end if;
  return new;
end $$;

drop trigger if exists order_items_before_insert on public.order_items;
create trigger order_items_before_insert before insert on public.order_items
  for each row execute function public.order_item_before_insert();
