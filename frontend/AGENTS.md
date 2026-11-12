<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ساختار و رفتار فرانت‌اند

- `src/app/page.tsx` وضعیت نشست، ورود/خروج، برد، وضعیت ذخیره و خطاهای رابط را مدیریت می‌کند.
- `src/lib/api.ts` درخواست‌های same-origin به FastAPI برای نشست و برد را نگه می‌دارد؛ cookie نشست به‌صورت خودکار ارسال می‌شود.
- `src/lib/board.ts` مدل‌های برد و عملیات خالص کارت‌ها و ستون‌ها را تعریف می‌کند.
- `src/app/globals.css` سبک‌ها، چیدمان واکنش‌گرا و کاهش حرکت برای `prefers-reduced-motion` را نگه می‌دارد.
- `public/` شامل تصویرها و نشان‌های استاتیک است.
- `src/**/*.test.ts(x)` آزمون‌های واحد و `e2e/` آزمون‌های مرورگر هستند.

برد پس از بازیابی نشست و دریافت موفق از API نمایش داده می‌شود. تغییرها با `PUT /api/board` ذخیره می‌شوند و رابط فقط از پاسخ ذخیره‌شدهٔ سرور همگام می‌شود؛ خطای درخواست به کاربر نشان داده می‌شود. پایگاه دادهٔ تازه پنج ستون خالی دارد و از همان ابتدا امکان افزودن کارت را می‌دهد.

از پوشهٔ `frontend/`:

- `npm run dev` برنامهٔ توسعه را اجرا می‌کند.
- `npm run build` خروجی ایستا را در `out/` می‌سازد.
- `npm test` آزمون‌های واحد را اجرا می‌کند.
- `npm run test:coverage` آزمون‌ها را با آستانهٔ پوشش خطوط اجرایی ۸۰٪ اجرا می‌کند.
- `npm run lint` ESLint را اجرا می‌کند.
- `npm run test:e2e` آزمون‌های مرورگر را با API ساختگی و سرور توسعه اجرا می‌کند.
- آزمون مرورگر واقعی را با اجرای برنامهٔ Docker و تنظیم `PLAYWRIGHT_INTEGRATION_URL` اجرا کن:

```powershell
$env:PLAYWRIGHT_INTEGRATION_URL = "http://127.0.0.1:8000"
npm run test:e2e -- --grep "@integration"
```

در برنامهٔ ایستا، API باید از همان مبدأ `/api/...` در دسترس باشد. دادهٔ برد را در localStorage یا state محلی به‌عنوان جایگزین ذخیره‌سازی بک‌اند نگه ندار؛ `src/lib/board.ts` فقط برای محاسبهٔ تغییر بعدی استفاده می‌شود.
