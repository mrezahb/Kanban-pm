# Kanban PM — مدیر پروژه

[فارسی](#فارسی) · [English](#english)

## فارسی

### معرفی

Kanban PM یک بورد تخصصی مدیریت پروژه به زبان فارسی بود که همراه با دستیار هوشمند برای مدیریت کارت‌ها توسعه داده شد. پروژه در ۱۰ مرحله پیاده‌سازی شد؛ تاریخچهٔ مراحل در [docs/PLAN.md](docs/PLAN.md) ثبت شده است. رابط کاربری، برد پنج‌ستونه، جابه‌جایی و ویرایش کارت‌ها و ذخیرهٔ پایدار اطلاعات در SQLite پیاده‌سازی شدند.

### ابزارهای استفاده‌شده

- فرانت‌اند: Next.js، React و TypeScript
- بک‌اند و API: Python و FastAPI
- پایگاه داده: SQLite
- بسته‌بندی و اجرا: Docker Compose و `uv`
- دستیار: OpenRouter با مدل `openai/gpt-oss-120b`
- آزمون‌ها: Vitest و Playwright برای فرانت‌اند، pytest برای بک‌اند

### راهنمای کوتاه

1. از ریشهٔ مخزن، دستور زیر برای ساخت و اجرای برنامه در Docker استفاده شد:

   ```sh
   docker compose up --build --detach
   ```

2. رابط در [http://localhost:8000](http://localhost:8000) باز شد و سلامت API در `/api/health` بررسی شد.
3. ورود آزمایشی با حساب ثابتی انجام شد که برای MVP در کد تعریف شده بود. اطلاعات ورود عمداً در این README عمومی درج نشدند؛ سازوکار ورود پیش از استفادهٔ واقعی باید جایگزین شود.
4. کارت‌ها از روی برد ایجاد، ویرایش یا جابه‌جا شدند. قابلیت دستیار برای ایجاد، ویرایش و انتقال کارت‌ها پیاده‌سازی شد؛ درخواست زنده به کلید OpenRouter نیاز داشت و در محیط توسعه تأیید نشد.
5. برای فعال‌کردن دستیار، لازم بود کلید فقط در فایل `.env` محلی تنظیم شود:

   ```dotenv
   OPENROUTER_API_KEY=your-openrouter-api-key
   ```

   بدون کلید، بخش برد اجرا شد اما درخواست‌های دستیار در دسترس نبودند. فایل `.env` در Git قرار نگرفت.
6. داده‌های برد در volume پایدار SQLite باقی ماندند. برای توقف کانتینر از `docker compose down` استفاده شد.

## English

### Project

Kanban PM was a Persian-language project management board with an AI assistant for managing cards. It was implemented in 10 documented stages; the stage history was recorded in [docs/PLAN.md](docs/PLAN.md). The five-column board, card editing and drag-and-drop, and persistent SQLite storage were implemented.

### Tools

- Frontend: Next.js, React, and TypeScript
- Backend and API: Python and FastAPI
- Database: SQLite
- Packaging and runtime: Docker Compose and `uv`
- Assistant: OpenRouter with `openai/gpt-oss-120b`
- Tests: Vitest and Playwright for the frontend; pytest for the backend

### Short guide

1. From the repository root, the following command built and started the app in Docker:

   ```sh
   docker compose up --build --detach
   ```

2. The UI was available at [http://localhost:8000](http://localhost:8000), and API health was checked at `/api/health`.
3. Local sign-in used the fixed MVP account defined in the source. Its credentials were intentionally omitted from this public README; the sign-in mechanism needed replacement before production use.
4. Cards were created, edited, and moved on the board. The assistant was implemented to create, edit, and move cards; live requests required an OpenRouter key and were not verified in the development environment.
5. To enable the assistant, its key had to be set only in a local root `.env` file:

   ```dotenv
   OPENROUTER_API_KEY=your-openrouter-api-key
   ```

   Without a key, the board worked but assistant requests were unavailable. `.env` was kept out of Git.
6. Board data persisted in a SQLite Docker volume. The container was stopped with `docker compose down`.
