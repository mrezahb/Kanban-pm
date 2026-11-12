import { expect, test } from "@playwright/test";

test("@integration persists board changes and revokes access on logout", async ({
  page,
}) => {
  const baseUrl = process.env.PLAYWRIGHT_INTEGRATION_URL;
  test.skip(!baseUrl, "Set PLAYWRIGHT_INTEGRATION_URL to a running Docker app.");

  await page.goto(baseUrl!);
  await page.getByLabel("نام کاربری").fill("user");
  await page.getByLabel("گذرواژه").fill("password");
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.locator("#page-title")).toHaveText("تختهٔ تیم محصول");

  const cardTitle = `آزمون یکپارچهٔ برد ${Date.now()}`;
  const editedCardTitle = `کارت پایدارشده ${Date.now()}`;
  await page.getByRole("button", { name: "افزودن کارت به ایده‌ها" }).click();
  await page.getByLabel("عنوان کارت").fill(cardTitle);
  await page.getByLabel("جزئیات کارت").fill("داده باید در SQLite باقی بماند.");
  await page.getByRole("button", { name: "ثبت کارت" }).click();
  const card = page.getByText(cardTitle);
  await expect(card).toBeVisible();

  const cardArticle = page.locator(".task-card").filter({ has: card });
  await cardArticle.getByRole("button", { name: `ویرایش کارت ${cardTitle}` }).click();
  await page.getByLabel("عنوان کارت").fill(editedCardTitle);
  await page.getByRole("button", { name: "ذخیره تغییرات" }).click();
  await expect(page.getByText(editedCardTitle)).toBeVisible();

  const handle = page
    .locator(".task-card")
    .filter({ has: page.getByText(editedCardTitle) })
    .getByTestId("drag-handle");
  const destination = page
    .getByRole("region", { name: "بازبینی" })
    .locator(".card-list");
  const sourceBox = await handle.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) {
    throw new Error("Unable to locate the card or destination column");
  }
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    destinationBox.x + destinationBox.width / 2,
    destinationBox.y + destinationBox.height / 2,
    { steps: 16 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("region", { name: "بازبینی" }).getByText(editedCardTitle),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("region", { name: "بازبینی" }).getByText(editedCardTitle),
  ).toBeVisible();
  await page.getByRole("button", { name: "خروج" }).click();
  await expect(
    page.getByRole("heading", { name: "ورود به فضای کاری" }),
  ).toBeVisible();
  const unauthenticatedStatus = await page.evaluate(async () =>
    (await fetch("/api/board")).status,
  );
  expect(unauthenticatedStatus).toBe(401);
});
