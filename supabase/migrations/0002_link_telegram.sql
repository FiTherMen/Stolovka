-- Привʼязка Telegram до акаунта, створеного через Google або пошту:
-- клієнт натискає кнопку в застосунку, бот отримує /start link_<токен> і записує його Telegram ID.
-- Після цього вхід у Telegram Mini App відкриває той самий акаунт, і бот надсилає сповіщення про замовлення.

alter table public.profiles
  add column if not exists telegram_link_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_telegram_link_token_idx on public.profiles (telegram_link_token);
