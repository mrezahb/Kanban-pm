# راهنمای بک‌اند

## مسئولیت و ساختار

- بک‌اند با FastAPI پیاده‌سازی شده و هم API و هم فایل‌های ایستای Next.js را ارائه می‌کند.
- `app/main.py` برنامهٔ FastAPI، مسیرهای API، احراز نشست و کارخانهٔ `create_app` را نگه می‌دارد.
- `app/database.py` اتصال SQLite، ساخت خودکار جدول‌ها و دادهٔ آغازین را مدیریت می‌کند.
- `app/security.py` hash گذرواژه، بررسی گذرواژه و hash توکن نشست را فراهم می‌کند.
- `app/schemas.py` مدل‌ها و اعتبارسنجی ورودی و خروجی API را تعریف می‌کند.
- آزمون‌های بک‌اند در `tests/` هستند؛ طرح مرجع SQLite در `../docs/database-schema.json` و تصمیم‌های آن در `../docs/database-design.md` ثبت شده‌اند.

## راه‌اندازی و آزمون

از ریشهٔ مخزن:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python -m uvicorn backend.app.main:app --reload --loop asyncio
backend/.venv/Scripts/python -m pytest backend/tests --cov=backend.app --cov-report=term-missing --cov-fail-under=80
```

در macOS و Linux، مسیر مفسر محیط مجازی را به `backend/.venv/bin/python` تغییر بده. Docker وابستگی‌های اجرایی را با `uv` از `backend/requirements.txt` نصب می‌کند.

## تنظیمات و پایگاه داده

- `DATABASE_PATH` مسیر فایل SQLite است؛ اگر تنظیم نشود، فایل در `data/kanban.sqlite3` ریشهٔ مخزن ساخته می‌شود. در Docker مسیر `/data/kanban.sqlite3` روی volume پایدار قرار دارد.
- جداول و قیدها هنگام شروع برنامه به‌شکل خودکار ساخته می‌شوند. اجرای مجدد آغازگر، برد موجود را بازنشانی نمی‌کند.
- SQLite باید foreign keys را برای هر اتصال فعال کند. زمان‌ها با UTC ذخیره می‌شوند.
- کاربر MVP با `user` و `password` ایجاد می‌شود؛ گذرواژه فقط به‌صورت PBKDF2 hash ذخیره می‌شود. گذرواژهٔ خام و توکن نشست را ثبت یا لاگ نکن.
- نشست با cookie از نوع `HttpOnly` و `SameSite=Strict` حمل می‌شود؛ مقدار خام تصادفی توکن فقط در cookie است و SQLite hash آن را نگه می‌دارد. نشست پس از ۷ روز منقضی می‌شود و خروج آن را باطل می‌کند.

## API

- `POST /api/auth/login` — اعتبارسنجی اطلاعات ثابت MVP و ایجاد نشست.
- `GET /api/auth/me` — اطلاعات کاربر نشست جاری.
- `POST /api/auth/logout` — ابطال نشست و پاک‌کردن cookie.
- `GET /api/board` — دریافت برد کاربر جاری.
- `PUT /api/board` — به‌روزرسانی اتمیک کل برد؛ برای هر ستون، نام و فهرست کامل کارت‌ها را بفرست. ترتیب آرایه‌ها ترتیب ذخیره‌شده است. همهٔ ستون‌های موجود باید فرستاده شوند (حذف ستون پشتیبانی نمی‌شود)؛ کارت حذف‌شده را می‌توان از فهرست کنار گذاشت. شناسه‌های موجود را برای نگه‌داشتنشان بفرست و برای ردیف تازه `id` را حذف کن.
- `GET /api/health` — بررسی سلامت سرویس.

مسیرهای برد به نشست معتبر نیاز دارند و مالکیت از کاربر نشست به دست می‌آید، نه از ورودی درخواست. ورودی نامعتبر با پاسخ `422`، ورود نامعتبر یا نشست منقضی‌شده با `401` و تلاش برای استفاده از شناسهٔ متعلق به برد دیگر با `409` پاسخ داده می‌شود.
