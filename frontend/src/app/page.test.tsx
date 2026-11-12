import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  AnchorHTMLAttributes,
  ImgHTMLAttributes,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Kanban board", () => {
  it("renders the sample columns and cards", () => {
    render(<Home />);

    expect(screen.getAllByTestId(/^kanban-column-/)).toHaveLength(5);
    expect(screen.getByText("بازنویسی متن صفحهٔ اصلی")).toBeTruthy();
  });

  it("edits a card title and details", () => {
    render(<Home />);
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

    expect(within(card).getByText("عنوان ویرایش‌شده")).toBeTruthy();
    expect(within(card).getByText("جزئیات ویرایش‌شده")).toBeTruthy();
  });

  it("adds and deletes a card", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-card-id" });
    render(<Home />);

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

    const card = screen.getByTestId("kanban-card-new-card-id");
    expect(within(card).getByText("کارت تازه")).toBeTruthy();
    fireEvent.click(
      within(card).getByRole("button", { name: "حذف کارت کارت تازه" }),
    );
    expect(screen.queryByTestId("kanban-card-new-card-id")).toBeNull();
  });

  it("adds a column and scrolls the board to it", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-column-id" });
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      },
    );
    render(<Home />);
    const board = screen.getByTestId("board-columns");
    const scrollTo = vi.fn();
    Object.defineProperty(board, "scrollTo", { value: scrollTo });

    fireEvent.click(screen.getByRole("button", { name: "افزودن ستون دیگر" }));
    fireEvent.change(screen.getByRole("textbox", { name: "نام ستون جدید" }), {
      target: { value: "  انتشار  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^افزودن$/ }));

    expect(screen.getAllByTestId(/^kanban-column-/)).toHaveLength(6);
    expect(screen.getByTestId("kanban-column-new-column-id")).toBeTruthy();
    expect(scrollTo).toHaveBeenCalledWith({
      left: -board.scrollWidth,
      behavior: "smooth",
    });
  });

  it("renames a column", () => {
    render(<Home />);
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
      within(column).getByRole("heading", { name: "ایده‌های تازه" }),
    ).toBeTruthy();
  });

  it("cancels a column rename with Escape", () => {
    render(<Home />);
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
});
