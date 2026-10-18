# پنل Onvioo

پنل مدیریت محتوا، مشتریان و تیم Onvioo. نقشه کامل و فازبندی در [سند نیازمندی‌ها](https://claude.ai/code/artifact/e0a70a3d-45c9-4c11-ac2a-045646aedfca) است.

## فاز ۰ (پایه) شامل چه چیزهایی است

- ورود با **کد پیامکی** (کاوه‌نگار) یا **رمز عبور**، با سه نقش: مدیر، کارمند و مشتری
- **مشتریان:** ثبت، ویرایش، وضعیت همکاری و ساختن دسترسی پرتال برای مشتری
- **کارکنان:** افزودن عضو تیم با سمت و نوع حقوق (ماهانه، ساعتی، به‌ازای هر کار)، فعال و غیرفعال کردن
- **فایل‌ها:** آپلود مستقیم ریلز و استوری به فضای ابری S3 (مثل آروان) تا ۵ گیگابایت، با نوار پیشرفت و دانلود امن
- **داشبورد:** مشتری‌های فعال، اعضای تیم و فایل‌های ماه جاری (ماه شمسی)
- **پرتال مشتری:** صفحه ورود جدا برای مشتری (امکاناتش در فاز ۲ اضافه می‌شود)
- ظاهر فارسی راست‌به‌چپ، تاریخ شمسی، تم روشن و تیره، و نصب روی گوشی مثل اپ (PWA)
- ثبت همه تغییرات مهم در جدول `audit_log`

## تکنولوژی

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · PostgreSQL + Drizzle ORM · S3-compatible storage · Vitest

## اجرای محلی

```bash
pnpm install
cp .env.example .env.local        # DATABASE_URL and, optionally, S3 / Kavenegar
pnpm db:migrate
pnpm create-admin "نام" 09120000000 "a-strong-password"
pnpm dev
```

Without Kavenegar keys in development, login codes are printed to the server log. To do the same under `next start`, set `SMS_DRIVER=log`.

## اجرا روی سرور با Docker

```bash
cp .env.example .env              # fill in S3 and Kavenegar values
docker compose up -d --build      # starts PostgreSQL, runs migrations, starts the panel on :3000
docker compose run --rm migrate node node_modules/tsx/dist/cli.mjs scripts/create-admin.mts "نام" 09120000000 "a-strong-password"
```

Put a reverse proxy with HTTPS (e.g. Caddy or Nginx) in front of port 3000. The bucket needs a CORS rule that allows `PUT` from the panel's domain so browsers can upload directly.

## دستورها

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks (also run in CI) |
| `pnpm db:generate` | Create a migration after changing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm create-admin` | Create or promote an admin user |

## ساختار

```
src/
  app/
    login/            ورود (رمز و کد پیامکی)
    (panel)/          پنل تیم: dashboard, clients, staff, files
    portal/           پرتال مشتری
  db/schema.ts        جدول‌های دیتابیس
  lib/auth/           نشست، کد یکبارمصرف، نقش‌ها
  lib/format.ts       تاریخ شمسی، اعداد فارسی، شماره موبایل
  lib/storage.ts      آپلود و دانلود از S3
  proxy.ts            هدایت کاربران واردنشده به صفحه ورود
```
