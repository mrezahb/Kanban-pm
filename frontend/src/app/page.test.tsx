import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  AnchorHTMLAttributes,
  ImgHTMLAttributes,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialBoard } from "@/lib/board";
import type { BoardResponse, User } from "@/lib/api";
import Home from "./page";

const apiMocks = vi.hoisted(() => {
  class MockApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  return {
    ApiError: MockApiError,
    getCurrentUser: vi.fn(),
    getBoard: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    saveBoard: vi.fn(),
    sendAssistantMessage: vi.fn(),
  };
});

vi.mock("@/lib/api", () => apiMocks);
vi.mock("next/link", () => ({
  default: ({
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

vi.mock("next/image", async () => {
  const { createElement } = await import("react");

  return {
    default: ({
      priority,
      ...props
    }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
      void priority;
      return createElement("img", { ...props, alt: props.alt ?? "" });
    },
  };
});

const user: User = { id: "user-id", username: "user" };
let savedBoard: BoardResponse;

function createServerBoard(): BoardResponse {
  return {
    id: "board-id",
    title: "تختهٔ تیم محصول",
    columns: initialBoard,
  };
}

async function renderBoard() {
  render(<Home />);
  await screen.findByRole("heading", { name: "تختهٔ تیم محصول" });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  savedBoard = createServerBoard();
  apiMocks.getCurrentUser.mockResolvedValue(user);
  apiMocks.getBoard.mockImplementation(async () => savedBoard);
  apiMocks.login.mockResolvedValue(user);
  apiMocks.logout.mockResolvedValue(undefined);
  apiMocks.saveBoard.mockImplementation(async (columns) => {
    savedBoard = { ...savedBoard, columns };
    return savedBoard;
  });
  apiMocks.sendAssistantMessage.mockResolvedValue({
    reply: "پاسخ دستیار",
    board_changed: false,
  });
});

describe("Kanban board authentication and persistence", () => {
  it("does not show the board before a session is restored", async () => {
    apiMocks.getCurrentUser.mockRejectedValueOnce(
      new apiMocks.ApiError("Unauthorized", 401),
    );
    render(<Home />);

    expect(await screen.findByRole("heading", { name: "ورود به فضای کاری" })).toBeTruthy();
    expect(screen.queryByTestId("board-columns")).toBeNull();
  });

  it("loads the saved board for an authenticated user", async () => {
    await renderBoard();

    expect(screen.getAllByTestId(/^kanban-column-/)).toHaveLength(5);
    expect(screen.getByText("بازنویسی متن صفحهٔ اصلی")).toBeTruthy();
    expect(apiMocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(apiMocks.getBoard).toHaveBeenCalledOnce();
  });

  it("logs in and reports invalid credentials", async () => {
    apiMocks.getCurrentUser.mockRejectedValueOnce(
      new apiMocks.ApiError("Unauthorized", 401),
    );
    apiMocks.login.mockRejectedValueOnce(
      new apiMocks.ApiError("Invalid username or password", 401),
    );
    render(<Home />);

    fireEvent.change(await screen.findByRole("textbox", { name: "نام کاربری" }), {
      target: { value: "user" },
    });
    fireEvent.change(screen.getByLabelText("گذرواژه"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ورود" }));

    expect(
      await screen.findByText("نام کاربری یا گذرواژه نادرست است."),
    ).toBeTruthy();
    expect(apiMocks.login).toHaveBeenCalledWith("user", "wrong");
  });

  it("retries after a session-check network error", async () => {
    apiMocks.getCurrentUser.mockRejectedValueOnce(new TypeError("fetch failed"));
    render(<Home />);

    fireEvent.click(await screen.findByRole("button", { name: "تلاش دوباره" }));

    expect(await screen.findByRole("heading", { name: "تختهٔ تیم محصول" })).toBeTruthy();
  });

  it("edits a card and reflects the saved server response", async () => {
    await renderBoard();
    const card = screen.getByTestId("kanban-card-brand-story");

    fireEvent.click(
      within(card).getByRole("button", {
        name: "ویرایش کارت روایت تازه برای برند",
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "عنوان کارت" }), {
      target: { value: "عنوان ویرایش‌شده" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "جزئیات کارت" }), {
      target: { value: "جزئیات ویرایش‌شده" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));

    expect(await within(card).findByText("عنوان ویرایش‌شده")).toBeTruthy();
    expect(within(card).getByText("جزئیات ویرایش‌شده")).toBeTruthy();
    expect(apiMocks.saveBoard).toHaveBeenCalledOnce();
  });

  it("adds and deletes a card through the board API", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-card-id" });
    await renderBoard();

    fireEvent.click(
      screen.getByRole("button", { name: "افزودن کارت به ایده‌ها" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "عنوان کارت" }), {
      target: { value: "کارت تازه" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "جزئیات کارت" }), {
      target: { value: "توضیح کوتاه" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ثبت کارت" }));

    const card = await screen.findByTestId("kanban-card-new-card-id");
    fireEvent.click(
      within(card).getByRole("button", { name: "حذف کارت کارت تازه" }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("kanban-card-new-card-id")).toBeNull(),
    );
    expect(apiMocks.saveBoard).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous board and displays save failures", async () => {
    apiMocks.saveBoard.mockRejectedValueOnce(new Error("Save failed"));
    await renderBoard();

    fireEvent.click(
      screen.getByRole("button", { name: "افزودن کارت به ایده‌ها" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "عنوان کارت" }), {
      target: { value: "کارت ذخیره‌نشده" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ثبت کارت" }));

    expect(await screen.findByText("Save failed")).toBeTruthy();
    expect(screen.queryByText("کارت ذخیره‌نشده")).toBeNull();
  });

  it("adds a column and scrolls the board after it is saved", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-column-id" });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    await renderBoard();
    const board = screen.getByTestId("board-columns");
    const scrollTo = vi.fn();
    Object.defineProperty(board, "scrollTo", { value: scrollTo });

    fireEvent.click(screen.getByRole("button", { name: "افزودن ستون دیگر" }));
    fireEvent.change(screen.getByRole("textbox", { name: "نام ستون جدید" }), {
      target: { value: "  انتشار  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^افزودن$/ }));

    expect(await screen.findByTestId("kanban-column-new-column-id")).toBeTruthy();
    expect(scrollTo).toHaveBeenCalledWith({
      left: -board.scrollWidth,
      behavior: "smooth",
    });
  });

  it("renames a column through the board API", async () => {
    await renderBoard();
    const column = screen.getByTestId("kanban-column-ideas");

    fireEvent.click(
      within(column).getByRole("button", {
        name: "تغییر نام ستون ایده‌ها",
      }),
    );
    const input = within(column).getByRole("textbox", { name: "نام ستون" });
    fireEvent.change(input, { target: { value: "ایده‌های تازه" } });
    const form = input.closest("form");
    if (!form) throw new Error("Column rename form was not found");
    fireEvent.submit(form);

    expect(
      await within(column).findByRole("heading", { name: "ایده‌های تازه" }),
    ).toBeTruthy();
  });

  it("cancels a column rename with Escape", async () => {
    await renderBoard();
    const column = screen.getByTestId("kanban-column-ideas");

    fireEvent.click(
      within(column).getByRole("button", {
        name: "تغییر نام ستون ایده‌ها",
      }),
    );
    const input = within(column).getByRole("textbox", { name: "نام ستون" });
    fireEvent.change(input, { target: { value: "نام لغوشده" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(
      within(column).getByRole("heading", { name: "ایده‌ها" }),
    ).toBeTruthy();
  });

  it("revokes the session and hides the board on logout", async () => {
    await renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "خروج" }));

    expect(
      await screen.findByRole("heading", { name: "ورود به فضای کاری" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("board-columns")).toBeNull();
    expect(apiMocks.logout).toHaveBeenCalledOnce();
  });

  it("sends a message, shows the reply, and includes prior chat history", async () => {
    await renderBoard();
    const composer = screen.getByRole("textbox", { name: "پیام به دستیار" });

    fireEvent.change(composer, { target: { value: "سلام" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));

    expect(await screen.findByText("پاسخ دستیار")).toBeTruthy();
    expect(apiMocks.sendAssistantMessage).toHaveBeenNthCalledWith(
      1,
      "سلام",
      [],
    );
    fireEvent.change(composer, { target: { value: "وضعیت برد چیست؟" } });
    const sendButton = screen.getByRole("button", { name: "ارسال پیام" });
    await waitFor(() => expect((sendButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(sendButton);

    await waitFor(() =>
      expect(screen.getAllByText("پاسخ دستیار")).toHaveLength(2),
    );
    expect(apiMocks.sendAssistantMessage).toHaveBeenNthCalledWith(
      2,
      "وضعیت برد چیست؟",
      [
        { role: "user", content: "سلام" },
        { role: "assistant", content: "پاسخ دستیار" },
      ],
    );
    expect(apiMocks.getBoard).toHaveBeenCalledOnce();
  });

  it("shows a pending state while waiting for the assistant", async () => {
    apiMocks.sendAssistantMessage.mockImplementationOnce(
      () => new Promise(() => {}),
    );
    await renderBoard();

    fireEvent.change(screen.getByRole("textbox", { name: "پیام به دستیار" }), {
      target: { value: "یک کارت بساز" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));

    expect(screen.getByText("در حال دریافت پاسخ از دستیار...")).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "ارسال پیام",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("refreshes the saved board after the assistant changes it", async () => {
    apiMocks.sendAssistantMessage.mockImplementationOnce(async () => {
      savedBoard = {
        ...savedBoard,
        columns: savedBoard.columns.map((column) =>
          column.id === "ideas"
            ? {
                ...column,
                cards: [
                  ...column.cards,
                  {
                    id: "assistant-card",
                    title: "کارت ساخته‌شده با دستیار",
                    details: "در برد ذخیره شده",
                  },
                ],
              }
            : column,
        ),
      };
      return { reply: "کارت را ایجاد کردم.", board_changed: true };
    });
    await renderBoard();

    fireEvent.change(screen.getByRole("textbox", { name: "پیام به دستیار" }), {
      target: { value: "یک کارت بساز" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));

    expect(await screen.findByTestId("kanban-card-assistant-card")).toBeTruthy();
    expect(await screen.findByText("تغییرها در برد ذخیره شدند")).toBeTruthy();
    expect(apiMocks.getBoard).toHaveBeenCalledTimes(2);
  });

  it("shows assistant errors and keeps the failed message available to retry", async () => {
    apiMocks.sendAssistantMessage.mockRejectedValueOnce(
      new apiMocks.ApiError("Invalid assistant response", 502),
    );
    await renderBoard();
    const composer = screen.getByRole("textbox", { name: "پیام به دستیار" });

    fireEvent.change(composer, { target: { value: "یک کارت بساز" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));

    expect(
      await screen.findByText(
        "پاسخ دستیار معتبر نبود یا سرویس موقتاً در دسترس نیست.",
      ),
    ).toBeTruthy();
    expect((composer as HTMLTextAreaElement).value).toBe("یک کارت بساز");
    expect(apiMocks.getBoard).toHaveBeenCalledOnce();
  });

  it("reports a failed board refresh and allows retrying it", async () => {
    const refreshedBoard: BoardResponse = {
      ...savedBoard,
      columns: savedBoard.columns.map((column) =>
        column.id === "ideas"
          ? {
              ...column,
              cards: [
                ...column.cards,
                {
                  id: "assistant-retry-card",
                  title: "کارت پس از بارگیری دوباره",
                  details: "",
                },
              ],
            }
          : column,
      ),
    };
    apiMocks.getBoard.mockReset();
    apiMocks.getBoard
      .mockResolvedValueOnce(savedBoard)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(refreshedBoard);
    apiMocks.sendAssistantMessage.mockResolvedValueOnce({
      reply: "تغییر ذخیره شد.",
      board_changed: true,
    });
    await renderBoard();

    fireEvent.change(screen.getByRole("textbox", { name: "پیام به دستیار" }), {
      target: { value: "یک کارت بساز" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));

    expect(
      await screen.findByText(/تغییرها ذخیره شدند، اما دریافت برد به‌روز ناموفق بود/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "بارگیری دوبارهٔ برد" }),
    );

    expect(
      await screen.findByTestId("kanban-card-assistant-retry-card"),
    ).toBeTruthy();
    expect(
      screen.queryByText(/دریافت برد به‌روز ناموفق بود/),
    ).toBeNull();
    expect(apiMocks.getBoard).toHaveBeenCalledTimes(3);
  });

  it("opens and closes the assistant sidebar from the mobile launcher", async () => {
    await renderBoard();
    const sidebar = screen.getByRole("complementary");
    const launcher = screen.getByRole("button", {
      name: "باز کردن گفت‌وگو با دستیار",
    });

    fireEvent.click(launcher);

    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(sidebar.classList.contains("sidebar-open")).toBe(true);
    fireEvent.click(
      screen.getAllByRole("button", { name: "بستن گفت‌وگو با دستیار" })[1],
    );
    expect(sidebar.classList.contains("sidebar-open")).toBe(false);
  });
});
