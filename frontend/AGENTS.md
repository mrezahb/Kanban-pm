<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ساختار و رفتار فرانت‌اند

- `src/app/page.tsx` صفحهٔ کانبان و تعامل‌های سمت کاربر را نگه می‌دارد. وضعیت برد نمایشی در حافظهٔ مرورگر است.
- `src/lib/board.ts` مدل‌های برد و عملیات خالص کارت‌ها و ستون‌ها را تعریف می‌کند.
- `src/app/globals.css` سبک‌ها، چیدمان واکنش‌گرا و کاهش حرکت برای `prefers-reduced-motion` را نگه می‌دارد.
- `public/` شامل تصویرها و نشان‌های استاتیک است.
- `src/**/*.test.ts(x)` آزمون‌های واحد و `e2e/` آزمون‌های مرورگر هستند.

برد نمونه ستون‌ها و کارت‌های قابل‌ویرایش دارد؛ کارت‌ها را می‌توان افزود، حذف و با کشیدن جابه‌جا کرد. هنوز احراز هویت، API و ذخیره‌سازی ماندگار در این بخش پیاده‌سازی نشده‌اند؛ تغییرات محلی با بارگذاری دوباره از بین می‌روند.

از پوشهٔ `frontend/`:

- `npm run dev` برنامهٔ توسعه را اجرا می‌کند.
- `npm run build` خروجی ایستا را در `out/` می‌سازد.
- `npm test` آزمون‌های واحد را اجرا می‌کند.
- `npm run test:coverage` آزمون‌ها را با آستانهٔ پوشش خطوط اجرایی ۸۰٪ اجرا می‌کند.
- `npm run lint` ESLint را اجرا می‌کند.
- `npm run test:e2e` آزمون‌های مرورگر را با سرور توسعه اجرا می‌کند.
- برای آزمودن برنامه‌ای که از قبل اجرا شده است، مقدار `PLAYWRIGHT_BASE_URL` را روی نشانی آن تنظیم و سپس `npm run test:e2e` را اجرا کن.

تغییرهای داده‌ای برد را در `src/lib/board.ts` نگه دار و از API یا ذخیره‌سازی مرورگر به‌عنوان جایگزین بک‌اند استفاده نکن؛ اتصال پایدار در مراحل بعدی انجام می‌شود.
