import { expect, test } from "@playwright/test";
import { initialBoard } from "../src/lib/board";

test.beforeEach(async ({ page }) => {
  let authenticated = false;
  let board = {
    id: "board-id",
    title: "تختهٔ تیم محصول",
    columns: structuredClone(initialBoard),
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (pathname === "/api/auth/me" && request.method() === "GET") {
      return authenticated
        ? json(200, { id: "user-id", username: "user" })
        : json(401, { detail: "Unauthorized" });
    }

    if (pathname === "/api/auth/login" && request.method() === "POST") {
      const credentials = request.postDataJSON() as {
        username: string;
        password: string;
      };
      if (
        credentials.username !== "user" ||
        credentials.password !== "password"
      ) {
        return json(401, { detail: "Invalid username or password" });
      }
      authenticated = true;
      return json(200, { id: "user-id", username: "user" });
    }

    if (pathname === "/api/auth/logout" && request.method() === "POST") {
      authenticated = false;
      return json(200, { status: "ok" });
    }

    if (pathname === "/api/assistant/chat" && request.method() === "POST") {
      if (!authenticated) return json(401, { detail: "Unauthorized" });
      board = {
        ...board,
        columns: board.columns.map((column, index) =>
          index === 0
            ? {
                ...column,
                cards: [
                  ...column.cards,
                  {
                    id: "assistant-e2e-card",
                    title: "کارت ساخته‌شده با دستیار",
                    details: "در برد ذخیره شده",
                  },
                ],
              }
            : column,
        ),
      };
      return json(200, {
        reply: "کارت را در ستون ایده‌ها ایجاد کردم.",
        board_changed: true,
      });
    }

    if (pathname === "/api/board") {
      if (!authenticated) return json(401, { detail: "Unauthorized" });
      if (request.method() === "GET") return json(200, board);
      if (request.method() === "PUT") {
        const update = request.postDataJSON() as {
          columns: typeof board.columns;
        };
        board = { ...board, columns: update.columns };
        return json(200, board);
      }
    }

    return json(404, { detail: "Not found" });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ورود به فضای کاری" }),
  ).toBeVisible();
  await page.getByLabel("نام کاربری").fill("user");
  await page.getByLabel("گذرواژه").fill("password");
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByRole("heading", { name: "تختهٔ تیم محصول" })).toBeVisible();
});

test("shows the saved Persian board with exactly five columns", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveTitle("مدیر پروژه | تختهٔ کانبان");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/project-manager-logo.svg",
  );
  await expect(
    page.getByRole("link", { name: "مدیر پروژه، صفحهٔ اصلی" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "تختهٔ تیم محصول" })).toBeVisible();
  await expect(page.getByTestId(/^kanban-column-/)).toHaveCount(5);
  await expect(page.getByText("بازنویسی متن صفحهٔ اصلی")).toBeVisible();
});

test("assistant chat creates a card and refreshes the board", async ({
  page,
}) => {
  const panel = page.getByRole("region", {
    name: "دستیار هوش مصنوعی",
  });
  await expect(panel).toBeVisible();
  await page.getByLabel("پیام به دستیار").fill("یک کارت جدید بساز");

  const requestPromise = page.waitForRequest((request) =>
    request.url().endsWith("/api/assistant/chat"),
  );
  await panel.getByRole("button", { name: "ارسال پیام" }).click();
  const request = await requestPromise;

  await expect(panel.getByText("کارت را در ستون ایده‌ها ایجاد کردم.")).toBeVisible();
  await expect(panel.getByText("تغییرها در برد ذخیره شدند")).toBeVisible();
  await expect(page.getByTestId("kanban-card-assistant-e2e-card")).toBeVisible();
  expect(request.postDataJSON()).toEqual({
    message: "یک کارت جدید بساز",
    history: [],
  });
});

test("opens the assistant sidebar on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "باز کردن گفت‌وگو با دستیار" })
    .click();

  await expect(
    page.getByRole("region", { name: "دستیار هوش مصنوعی" }),
  ).toBeVisible();
  await expect(page.getByLabel("پیام به دستیار")).toBeVisible();
  await page.getByRole("button", { name: "بستن گفت‌وگو با دستیار" }).first().click();
  await expect(
    page.getByRole("region", { name: "دستیار هوش مصنوعی" }),
  ).toBeHidden();
});

test("adds and removes a card", async ({ page }) => {
  await page.getByRole("button", { name: "افزودن کارت به ایده‌ها" }).click();
  await page.getByLabel("عنوان کارت").fill("آزمون جریان جدید");
  await page.getByLabel("جزئیات کارت").fill("این کارت برای آزمودن رابط ساخته شده است.");
  await page.getByRole("button", { name: "ثبت کارت" }).click();

  await expect(page.getByText("آزمون جریان جدید")).toBeVisible();
  await page
    .getByRole("button", { name: "حذف کارت آزمون جریان جدید" })
    .click();
  await expect(page.getByText("آزمون جریان جدید")).toHaveCount(0);
});

test("edits a card and can cancel a later edit", async ({ page }) => {
  const card = page.getByTestId("kanban-card-brand-story");
  await card.getByRole("button", { name: "ویرایش کارت روایت تازه برای برند" }).click();

  const title = page.getByRole("textbox", { name: "عنوان کارت" });
  const details = page.getByRole("textbox", { name: "جزئیات کارت" });
  await title.fill("روایت بازبینی‌شده");
  await details.fill("جزئیات ویرایش‌شده");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).click();

  await expect(card.getByRole("heading", { name: "روایت بازبینی‌شده" })).toBeVisible();
  await expect(card.getByText("جزئیات ویرایش‌شده")).toBeVisible();

  await card.getByRole("button", { name: "ویرایش کارت روایت بازبینی‌شده" }).click();
  await page.getByRole("textbox", { name: "عنوان کارت" }).fill("تغییر لغوشده");
  await page.getByRole("button", { name: "انصراف" }).click();

  await expect(card.getByRole("heading", { name: "روایت بازبینی‌شده" })).toBeVisible();
  await expect(card.getByText("تغییر لغوشده")).toHaveCount(0);
});

test("renames a column", async ({ page }) => {
  await page.getByRole("button", { name: "تغییر نام ستون ایده‌ها" }).click();
  const nameInput = page.getByRole("textbox", { name: "نام ستون" });

  await nameInput.fill("ایده‌های تازه");
  await nameInput.press("Enter");

  await expect(
    page.getByRole("heading", { name: "ایده‌های تازه" }),
  ).toBeVisible();
  await expect(page.getByTestId(/^kanban-column-/)).toHaveCount(5);
});

test("adds a column to the left without shrinking existing columns", async ({
  page,
}) => {
  const board = page.getByTestId("board-columns");
  const ideasColumn = page.getByTestId("kanban-column-ideas");
  const doneColumn = page.getByTestId("kanban-column-done");
  const originalIdeasWidth = (await ideasColumn.boundingBox())?.width;
  const originalDoneWidth = (await doneColumn.boundingBox())?.width;

  const ideasBefore = await ideasColumn.boundingBox();
  const plannedBefore = await page
    .getByTestId("kanban-column-planned")
    .boundingBox();
  expect(ideasBefore?.x).toBeGreaterThan(plannedBefore?.x ?? 0);

  await page.getByRole("button", { name: "افزودن ستون دیگر" }).click();
  await page.getByRole("textbox", { name: "نام ستون جدید" }).fill("انتشار");
  await page.getByRole("button", { name: "افزودن", exact: true }).click();

  await expect(page.getByTestId(/^kanban-column-/)).toHaveCount(6);
  const newColumn = page.getByTestId(/^kanban-column-/).filter({
    has: page.getByRole("heading", { name: "انتشار" }),
  });
  await expect(newColumn).toBeVisible();
  await expect(page.getByTestId("card-count")).toHaveText("9");

  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeLessThan(0);
  const [dimensions, ideasAfter, doneAfter, newColumnAfter] = await Promise.all([
    board.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
    })),
    ideasColumn.boundingBox(),
    doneColumn.boundingBox(),
    newColumn.boundingBox(),
  ]);

  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  expect(dimensions.scrollLeft).toBeLessThan(0);
  expect(ideasAfter?.width).toBe(originalIdeasWidth);
  expect(doneAfter?.width).toBe(originalDoneWidth);
  expect(newColumnAfter?.x).toBeLessThan(doneAfter?.x ?? 0);
});

test("moves a card to another column", async ({ page }) => {
  const card = page.getByTestId("kanban-card-product-copy");
  const handle = card.getByTestId("drag-handle");
  const destination = page
    .getByTestId("kanban-column-review")
    .locator(".card-list");

  const sourceBox = await handle.boundingBox();
  const destinationBox = await destination.boundingBox();

  if (!sourceBox || !destinationBox) {
    throw new Error("Unable to locate the card or destination column");
  }

  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const end = {
    x: destinationBox.x + destinationBox.width / 2,
    y: destinationBox.y + destinationBox.height / 2,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 2 });
  await page.mouse.move(end.x, end.y, { steps: 16 });
  await page.mouse.up();

  await expect(
    page.getByTestId("kanban-column-review").getByText("بازنویسی متن صفحهٔ اصلی"),
  ).toBeVisible();
  await expect(
    page.getByTestId("kanban-column-in-progress").getByText(
      "بازنویسی متن صفحهٔ اصلی",
    ),
  ).toHaveCount(0);
});

test("reorders cards within the same column", async ({ page }) => {
  const column = page.getByTestId("kanban-column-ideas");
  const source = page
    .getByTestId("kanban-card-onboarding")
    .getByTestId("drag-handle");
  const target = page.getByTestId("kanban-card-brand-story");
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error("Unable to locate the cards to reorder");
  }

  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const end = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y - 8, { steps: 2 });
  await page.mouse.move(end.x, end.y, { steps: 16 });
  await page.mouse.up();

  await expect(column.locator(".task-card").first()).toHaveAttribute(
    "data-testid",
    "kanban-card-onboarding",
  );
});

test("keeps the columns horizontally scrollable on a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const dimensions = await page.locator(".board-columns").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
});

test("reduces card transition duration when reduced motion is requested", async ({
  page,
}) => {
  const card = page.getByTestId("kanban-card-brand-story");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const standardDuration = await card.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  );
  expect(standardDuration).toBeGreaterThan(0.001);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedDuration = await card.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  );
  expect(reducedDuration).toBeLessThan(0.001);
});

test("reloads the persisted board and blocks access after logout", async ({
  page,
}) => {
  await page.getByRole("button", { name: "افزودن کارت به ایده‌ها" }).click();
  await page.getByLabel("عنوان کارت").fill("کارت ماندگار");
  await page.getByRole("button", { name: "ثبت کارت" }).click();
  await expect(page.getByText("کارت ماندگار")).toBeVisible();

  await page.reload();
  await expect(page.getByText("کارت ماندگار")).toBeVisible();
  await page.getByRole("button", { name: "خروج" }).click();
  await expect(
    page.getByRole("heading", { name: "ورود به فضای کاری" }),
  ).toBeVisible();
  const unauthenticatedStatus = await page.evaluate(async () =>
    (await fetch("/api/board")).status,
  );
  expect(unauthenticatedStatus).toBe(401);
});
