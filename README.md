# مدیر پروژه | Kanban PM

[فارسی](#فارسی) · [English](#english)

## فارسی

مدیر پروژه یک MVP فارسی برای مدیریت کارها با برد کانبان است. فرانت‌اند با Next.js ساخته می‌شود؛ FastAPI فایل‌های ایستای آن و API را در یک کانتینر Docker ارائه می‌کند. اطلاعات برد در SQLite ذخیره می‌شوند.

### قابلیت‌ها

- ورود با نشست هفت‌روزه؛ خروج نشست را باطل می‌کند.
- برد کانبان با پنج ستون آغازین؛ امکان تغییر نام ستون‌ها، افزودن ستون و ایجاد، ویرایش و جابه‌جایی کارت‌ها.
- دستیار OpenRouter برای ایجاد، ویرایش و جابه‌جایی کارت‌ها.
- ذخیرهٔ تغییرهای برد در SQLite با volume پایدار Docker.

### اجرا

نیازمند Docker و Docker Compose است. از ریشهٔ مخزن اجرا کنید:

```sh
docker compose up --build --detach
```

برنامه در [http://localhost:8000](http://localhost:8000) در دسترس است. برای توقف:

```sh
docker compose down
```

ورود MVP:

- نام کاربری: `user`
- گذرواژه: `password`

این اطلاعات ثابت و مخصوص MVP هستند؛ این برنامه را بدون افزودن احراز هویت مناسب برای محیط واقعی منتشر نکنید.

### دستیار هوش مصنوعی

برای استفاده از دستیار، فایل `.env` را در ریشه بسازید و کلید OpenRouter را در آن قرار دهید:

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
```

مدل استفاده‌شده `openai/gpt-oss-120b` است. بدون این کلید، برنامه و برد اجرا می‌شوند اما درخواست‌های دستیار در دسترس نیستند. فایل `.env` نادیده گرفته می‌شود؛ آن را commit نکنید.

### توسعه و آزمون

آزمون‌ها و ابزارهای فرانت‌اند:

```sh
cd frontend
npm ci
npm test
npm run test:coverage
npm run test:e2e
npm run lint
npm run build
```

در PowerShell ویندوز، اگر اجرای `npm` مسدود شد، از `npm.cmd` به‌جای `npm` استفاده کنید.

برای آزمون بک‌اند، از ریشهٔ مخزن یک محیط مجازی بسازید:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python -m pytest backend\tests --cov=backend.app --cov-report=term-missing --cov-fail-under=80
```

در macOS/Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests --cov=backend.app --cov-report=term-missing --cov-fail-under=80
```

آزمون پوشش فرانت‌اند نیز حداقل ۸۰٪ پوشش خطوط اجرایی را enforce می‌کند.

## English

Kanban PM is a Persian-language MVP for project task management. The Next.js frontend is statically built and served with the FastAPI API from one Docker container. Board data is stored in SQLite.

### Features

- Login with a seven-day session; logging out revokes the session.
- A Kanban board with five default columns; rename or add columns, and create, edit, and move cards.
- An OpenRouter assistant that can create, edit, and move cards.
- Board changes persist in SQLite on a Docker volume.

### Run

Requires Docker and Docker Compose. From the repository root:

```sh
docker compose up --build --detach
```

Open [http://localhost:8000](http://localhost:8000). Stop the app with:

```sh
docker compose down
```

MVP login:

- Username: `user`
- Password: `password`

These fixed credentials are for the MVP only. Do not expose this app to production users without adding appropriate authentication.

### AI assistant

To enable the assistant, create a root `.env` file and add your OpenRouter key:

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
```

The configured model is `openai/gpt-oss-120b`. The app and board work without this key, but assistant requests are unavailable. `.env` is ignored by Git; do not commit it.

### Development and tests

Frontend tests and tools:

```sh
cd frontend
npm ci
npm test
npm run test:coverage
npm run test:e2e
npm run lint
npm run build
```

In Windows PowerShell, if running `npm` is blocked, use `npm.cmd` instead.

For backend tests, create a virtual environment from the repository root.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python -m pytest backend\tests --cov=backend.app --cov-report=term-missing --cov-fail-under=80
```

On macOS/Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests --cov=backend.app --cov-report=term-missing --cov-fail-under=80
```

Frontend coverage tests also enforce a minimum 80% line coverage.
