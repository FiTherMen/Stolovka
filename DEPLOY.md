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

## 6. Вхід через Google (необовʼязково)

Кнопка «Увійти через Google» вже є на сайті. Щоб вона запрацювала, потрібен ключ Google і два рядки в налаштуваннях Supabase. У Telegram Mini App кнопки немає: Google забороняє вхід у вбудованому браузері, там працює вхід через Telegram.

**6.1. Ключ у Google Cloud (робить власник, ~10 хв).**

1. https://console.cloud.google.com → створіть проєкт «Tarilka».
2. **APIs & Services → OAuth consent screen** (або **Google Auth Platform → Branding**): тип **External**, назва застосунку «Тарілка», ваша пошта для підтримки і контактів, домен `stolovka.price.biz.ua`. Scopes додавати не треба (вистачає email і profile). Опублікуйте застосунок (**Publish app**), інакше увійти зможуть лише тестові користувачі.
3. **Credentials → Create credentials → OAuth client ID**, тип **Web application**:
   - **Authorized JavaScript origins:** `https://stolovka.price.biz.ua`
   - **Authorized redirect URIs:** `<адреса Supabase>/auth/v1/callback`, тобто значення `API_EXTERNAL_URL` з `/opt/supabase/.env` плюс `/auth/v1/callback`. Якщо Supabase відкривається на тому ж домені, це `https://stolovka.price.biz.ua/auth/v1/callback`.
4. Google покаже **Client ID** і **Client secret**. Ці два значення йдуть лише в `.env` на сервері, не в чат і не в репозиторій.

**6.2. Supabase на сервері (варіант Б).** У `/opt/supabase/.env` додайте:

```
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=<Client ID>
GOOGLE_SECRET=<Client secret>
ADDITIONAL_REDIRECT_URLS=https://stolovka.price.biz.ua/**
```

і в `/opt/supabase/docker-compose.yml` у сервіс `auth` → `environment` додайте (якщо таких рядків ще немає):

```yaml
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${GOOGLE_ENABLED}
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_SECRET}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback
```

Перевірте, що `SITE_URL=https://stolovka.price.biz.ua` і що `GOTRUE_URI_ALLOW_LIST` у сервісі `auth` бере значення з `${ADDITIONAL_REDIRECT_URLS}`. Потім `cd /opt/supabase && docker compose up -d auth`.

Для варіанту А те саме робиться в панелі Supabase: **Authentication → Sign In / Providers → Google** (Client ID і Secret), а `https://stolovka.price.biz.ua/**` додається в **Authentication → URL Configuration → Redirect URLs**.

**6.3. Міграція бази.** Виконайте `supabase/migrations/0002_link_telegram.sql` так само, як у кроці А2 або Б3. Вона додає кнопку «Підключити Telegram» для тих, хто увійшов через Google або пошту: після привʼязки бот надсилає їм сповіщення, а Mini App відкриває той самий акаунт.

**Перевірка:** на сайті «Увійти» → «Увійти через Google» → вибір акаунта → повернення на сайт уже з входом. Профіль і роль створюються так само, як для входу через Telegram.

## Оновлення

```bash
cd /opt/stolovka && git pull && docker compose up -d --build
```

Якщо в оновленні є новий файл у `supabase/migrations/`, виконайте його так само, як у кроці А2 або Б3.

## Якщо щось не працює

| Симптом | Що перевірити |
|---|---|
| Сайт не відкривається, немає HTTPS | `docker compose logs caddy`; A-запис домену; порти 80/443 відкриті |
| Вгорі «Застосунок ще не підключено до бази» | `SUPABASE_URL` / `SUPABASE_ANON_KEY` у `.env`, потім `up -d --build` |
| У Telegram «Не вдалося увійти» | `TELEGRAM_BOT_TOKEN` і `SUPABASE_SERVICE_ROLE_KEY`; `docker compose logs app` |
| Бот мовчить на `/start` | повторіть крок 5.1; `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| Кухарю не приходять замовлення | кухар має натиснути «Кухня → Профіль → Підключити Telegram» |
