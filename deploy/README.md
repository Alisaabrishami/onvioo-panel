# راه‌اندازی پنل روی سرور

این روش طوری طراحی شده که رمز سرور را به هیچ‌کس (حتی Claude) ندهید:

- یک بار خودتان به سرور وصل می‌شوید و `server-setup.sh` را اجرا می‌کنید.
- این اسکریپت یک کاربر محدود به نام `deploy` و یک کلید SSH مخصوص GitHub Actions می‌سازد.
- کلید فقط در GitHub Secrets ذخیره می‌شود. از آن به بعد هر بار که چیزی در `main` ادغام شود، پنل خودکار روی سرور به‌روز می‌شود.

تصویر Docker پنل روی سرورهای GitHub ساخته و آماده به سرور فرستاده می‌شود، چون سرور ایران به Docker Hub و npm دسترسی پایداری ندارد. سرور فقط تصویر PostgreSQL و Caddy را یک بار از آینه‌ی آروان می‌گیرد.

## ۱. آماده‌کردن سرور (یک بار)

سرور: Ubuntu 22.04 یا جدیدتر (یا Debian 12)، حداقل ۲ گیگ رم و ۲۰ گیگ دیسک.

از کامپیوتر خودتان (ترمینال مک/لینوکس یا PowerShell ویندوز):

```bash
scp deploy/server-setup.sh root@37.32.4.144:
ssh root@37.32.4.144 "bash server-setup.sh 37.32.4.144"
```

اگر با کاربری غیر از root وارد می‌شوید، بنویسید `sudo bash server-setup.sh 37.32.4.144`.

در پایان، اسکریپت چهار مقدار چاپ می‌کند: `SERVER_HOST`، `SERVER_PORT`، `SERVER_SSH_KEY` و `SERVER_KNOWN_HOSTS`.

## ۲. گذاشتن کلیدها در GitHub

در ریپو بروید به Settings → Secrets and variables → Actions → New repository secret و هر چهار مقدار را با همان نام اضافه کنید. این مقدارها را در چت یا جای دیگری نفرستید.

## ۳. اولین دیپلوی

در تب Actions، ورک‌فلوی **Deploy** را انتخاب و Run workflow را بزنید. این دکمه وقتی دیده می‌شود که این فایل‌ها در `main` ادغام شده باشند. بعد از آن، هر ادغام در `main` خودکار دیپلوی می‌شود.

بعد از سبز شدن، پنل روی `http://37.32.4.144` باز می‌شود. برای ساختن اولین مدیر، روی سرور:

```bash
sudo -u deploy /opt/onvioo/create-admin.sh
```

## ۴. تنظیمات (`/opt/onvioo/.env`)

رمز دیتابیس و کلیدهای داخلی (`POSTGRES_PASSWORD`، `CRON_SECRET`، `TOKEN_SECRET`، `BOT_WEBHOOK_SECRET`) خودکار و تصادفی ساخته شده‌اند. بقیه را هر وقت آماده شد پر کنید:

```bash
sudo -u deploy nano /opt/onvioo/.env
cd /opt/onvioo && sudo -u deploy docker compose up -d
```

| متغیر | برای چه |
|---|---|
| `DOMAIN` و `APP_URL` | دامنه، مثلا `panel.onvioo.ir`. رکورد A دامنه را به IP سرور بزنید؛ Caddy خودش گواهی HTTPS می‌گیرد. `APP_URL` را `https://` همان دامنه کنید |
| `KAVENEGAR_API_KEY`، `KAVENEGAR_OTP_TEMPLATE` | پیامک کد ورود. تا وقتی خالی است، کد در `docker compose logs app` دیده می‌شود |
| `S3_*` | باکت آروان برای فایل‌ها و ویدیوها (قانون CORS برای `PUT` از دامنه‌ی پنل لازم است) |
| `BALE_BOT_TOKEN`، `BALE_CHAT_ID` | ربات بله |
| `ZARINPAL_MERCHANT_ID` | پرداخت آنلاین فاکتورها |
| `ANTHROPIC_API_KEY` (و `ANTHROPIC_BASE_URL`) | قابلیت‌های هوش مصنوعی |
| `WHISPER_URL` | زیرنویس خودکار |

فهرست کامل با توضیح در `/opt/onvioo/env.example` است.

## کارهای خودکار روی سرور

`server-setup.sh` این‌ها را در `/etc/cron.d/onvioo` گذاشته است (به وقت تهران):

- پایش سایت‌ها هر ۵ دقیقه
- کارهای ویدیو هر دقیقه
- آمار اینستاگرام ساعت ۶
- گزارش ماهانه ساعت ۷
- گزارش هفتگی شنبه ساعت ۸
- یادآورها ساعت ۹
- بکاپ دیتابیس هر شب ساعت ۳:۳۰ در `/opt/onvioo/backups`، که ۱۴ روز آخر نگه داشته می‌شود

## دستورهای مفید

```bash
cd /opt/onvioo
sudo -u deploy docker compose ps             # وضعیت
sudo -u deploy docker compose logs -f app    # لاگ پنل
sudo -u deploy docker compose restart app    # ری‌استارت
# برگشت به نسخه‌ی قبل:
sudo -u deploy docker images onvioo-panel    # تگ نسخه‌ی قبلی را پیدا کنید
sudo -u deploy docker tag onvioo-panel:<tag> onvioo-panel:latest && sudo -u deploy docker compose up -d
```

## اگر GitHub به سرور وصل نشد

اگر مرحله‌ی Upload در Actions با timeout خطا داد، فایروال دیتاسنتر یا فیلترینگ بین‌الملل جلوی SSH از خارج را گرفته است. از پشتیبانی هاست بخواهید پورت SSH را برای ورودی خارجی باز کنند، یا پورت SSH را عوض کنید و `SERVER_PORT` را به‌روز کنید.
