# Запуск Тарілки на власному сервері

Інструкція для адміністратора сервера. Результат: сайт `https://<домен>` з HTTPS, який також відкривається як Telegram Mini App у боті @online_stolovka_bot.

Два варіанти, різниця лише в тому, де живе база даних:

| | А. База в Supabase Cloud (рекомендовано) | Б. Усе на сервері |
|---|---|---|
| Що на сервері | сайт + API + Caddy | сайт + API + Caddy + повний Supabase (≈10 контейнерів) |
| Вимоги до сервера | 1 ГБ RAM | від 4 ГБ RAM, 20 ГБ диска |
| Резервні копії бази | робить Supabase | налаштовуєте самі (крок Б5) |
| Час налаштування | ~30 хв | ~1,5 год |

## Що потрібно від власника

- **Токен бота** @online_stolovka_bot (з @BotFather). Вставляється лише у файл `.env` на сервері.
- **Telegram ID власника** (число, показує @userinfobot) → `ADMIN_TELEGRAM_IDS`.
- **Домен** або піддомен для сайту, напр. `stolovka.example.com`.

Секрети не надсилайте в чати і не комітьте в репозиторій.

## Спільні кроки

### 1. Сервер

- Ubuntu 22.04+ або Debian 12, відкриті порти 80 і 443.
- Docker з плагіном compose: `curl -fsSL https://get.docker.com | sh`
- DNS: A-запис `stolovka.example.com` → IP сервера (для варіанту Б ще один, напр. `db.stolovka.example.com`). Перевірка: `dig +short stolovka.example.com`.

### 2. Код

```bash
git clone https://github.com/FiTherMen/Stolovka.git /opt/stolovka
cd /opt/stolovka
cp deploy/env.example .env
chmod 600 .env
```

Поки PR з прототипом не злитий у `main`, додайте `git checkout claude/project-thread-pskwk5`.

Далі виконайте варіант А або Б, потім кроки 3–5.

---

## Варіант А: база в Supabase Cloud

**А1.** На [supabase.com](https://supabase.com) створіть проєкт (регіон `West EU` / `Central EU`).

**А2.** SQL Editor → New query → вставте весь файл `supabase/migrations/0001_init.sql` → Run. Має завершитися без помилок.

**А3.** Authentication → Sign In / Providers → Email: вимкніть «Confirm email» (інакше вбудована пошта Supabase надсилає лише кілька листів на годину).
Authentication → URL Configuration → Site URL: `https://<APP_DOMAIN>`.

**А4.** Project Settings → API. Заповніть у `.env`:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=<anon public>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
```

`SUPABASE_DOMAIN` залиште порожнім. Переходьте до кроку 3.

---

## Варіант Б: власний Supabase на цьому сервері

**Б1.** Офіційна збірка Supabase для Docker:

```bash
git clone --depth 1 https://github.com/supabase/supabase /opt/supabase-src
mkdir -p /opt/supabase && cp -r /opt/supabase-src/docker/. /opt/supabase/
cd /opt/supabase && cp .env.example .env && chmod 600 .env
```

**Б2.** У `/opt/supabase/.env` змініть (опис і генератор ключів: https://supabase.com/docs/guides/self-hosting/docker):

- `POSTGRES_PASSWORD`, `JWT_SECRET` (від 32 символів), `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` — нові випадкові значення;
- `ANON_KEY` і `SERVICE_ROLE_KEY` — згенерувати з вашого `JWT_SECRET` (за посиланням вище);
- `SITE_URL=https://<APP_DOMAIN>`
- `API_EXTERNAL_URL=https://<SUPABASE_DOMAIN>` і `SUPABASE_PUBLIC_URL=https://<SUPABASE_DOMAIN>`
- `ENABLE_EMAIL_AUTOCONFIRM=true` (SMTP не потрібен).

```bash
docker compose up -d
docker compose ps        # усі сервіси мають бути healthy, Kong слухає порт 8000
```

**Б3.** Схема бази Столовки (після того як усі контейнери стали healthy):

```bash
docker exec -i supabase-db psql -U postgres -d postgres < /opt/stolovka/supabase/migrations/0001_init.sql
```

**Б4.** У `/opt/stolovka/.env`:

```
SUPABASE_DOMAIN=db.stolovka.example.com
SUPABASE_URL=https://db.stolovka.example.com
SUPABASE_ANON_KEY=<ANON_KEY з /opt/supabase/.env>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY з /opt/supabase/.env>
```

і розкоментуйте блок `{$SUPABASE_DOMAIN}` у `deploy/Caddyfile`. Панель Supabase Studio буде на `https://db.stolovka.example.com` (логін з `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`).

**Б5.** Щоденна резервна копія (cron від root):

```bash
mkdir -p /opt/backups
echo '30 3 * * * docker exec supabase-db pg_dump -U postgres -d postgres -Fc > /opt/backups/stolovka-$(date +\%F).dump && find /opt/backups -mtime +14 -delete' | crontab -
```

---

## 3. Telegram і решта змінних

У `/opt/stolovka/.env`:

```
APP_DOMAIN=stolovka.example.com
TELEGRAM_BOT_USERNAME=online_stolovka_bot
TELEGRAM_BOT_TOKEN=<токен від власника>
TELEGRAM_WEBHOOK_SECRET=<результат: openssl rand -hex 32>
ADMIN_TELEGRAM_IDS=<Telegram ID власника>
```

## 4. Запуск

```bash
cd /opt/stolovka
docker compose up -d --build
docker compose logs -f app     # має зʼявитися «Столовка: http://localhost:3000»
```

Перевірка: `https://<APP_DOMAIN>` відкриває меню. Сертифікат HTTPS Caddy отримує сам за 10–60 секунд після першого запиту.

Значення `SUPABASE_URL`, `SUPABASE_ANON_KEY` і `TELEGRAM_BOT_USERNAME` вбудовуються в сайт під час збірки, тому після їх зміни потрібен `docker compose up -d --build`.

## 5. Підключити бота

1. Один раз відкрийте у браузері:
   `https://<APP_DOMAIN>/api/telegram/setup?secret=<TELEGRAM_WEBHOOK_SECRET>`
   У відповіді для `webhook`, `menu` і `commands` має бути `"ok": true`.
2. @BotFather → `/setdomain` → @online_stolovka_bot → `<APP_DOMAIN>` (потрібно для кнопки «Увійти через Telegram» на сайті).
3. Власник пише боту `/start`, натискає «Відкрити меню». Він автоматично стає адміністратором (`/admin` у застосунку).

## Оновлення

```bash
cd /opt/stolovka && git pull && docker compose up -d --build
```

Якщо в оновленні є новий файл у `supabase/migrations/`, виконайте його так само, як у кроці А2 або Б3. Файли виконуються по черзі за номером (`0002_…` після `0001_…`) і безпечні для повторного запуску.

## Сторінки кухарів і посилання в Telegram

- `https://<APP_DOMAIN>/chef/<адреса>` віддає сервер застосунку з тегами Open Graph (імʼя, опис, фото кухаря). Якщо перед застосунком стоїть nginx, він має проксувати і `/chef/...` на застосунок, а не віддавати `index.html` сам.
- Посилання `https://t.me/online_stolovka_bot?startapp=chef_<адреса>` відкриває сторінку кухаря одразу в Mini App. Для нього в @BotFather потрібно один раз увімкнути головний Mini App бота: `/mybots` → бот → Bot Settings → Configure Mini App → Enable → `https://<APP_DOMAIN>`.

## Вечірнє зведення «Що готувати»

Сервер застосунку щовечора о 21:05 (за Мадридом, одразу після дедлайну сніданків) надсилає кожному кухарю з підключеним Telegram список страв на завтра. Час змінюється змінною `PREP_SUMMARY_TIME=HH:MM` у `.env`, `PREP_SUMMARY_TIME=off` вимикає. Для кнопки «Що готувати» в повідомленні потрібен `PUBLIC_APP_URL`.

Перевірити вручну: `https://<APP_DOMAIN>/api/notify/prep-summary?secret=<TELEGRAM_WEBHOOK_SECRET>` (можна додати `&date=YYYY-MM-DD`).

## Якщо щось не працює

| Симптом | Що перевірити |
|---|---|
| Сайт не відкривається, немає HTTPS | `docker compose logs caddy`; A-запис домену; порти 80/443 відкриті |
| Вгорі «Застосунок ще не підключено до бази» | `SUPABASE_URL` / `SUPABASE_ANON_KEY` у `.env`, потім `up -d --build` |
| У Telegram «Не вдалося увійти» | `TELEGRAM_BOT_TOKEN` і `SUPABASE_SERVICE_ROLE_KEY`; `docker compose logs app` |
| Бот мовчить на `/start` | повторіть крок 5.1; `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| Кухарю не приходять замовлення | кухар має натиснути «Кухня → Профіль → Підключити Telegram» |
