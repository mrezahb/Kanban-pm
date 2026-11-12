import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  getBoard,
  getCurrentUser,
  login,
  logout,
  saveBoard,
} from "./api";
import type { Board } from "./board";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("API client", () => {
  it("uses same-origin credentials for session and board reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "user-id", username: "user" }))
      .mockResolvedValueOnce(jsonResponse({ id: "board-id", title: "Board", columns: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getCurrentUser();
    await getBoard();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/me",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/board",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("sends login and board updates with the expected request bodies", async () => {
    const columns: Board = [
      { id: "column-id", name: "ایده‌ها", cards: [] },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "user-id", username: "user" }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "board-id", title: "Board", columns }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await login("user", "password");
    await logout();
    await saveBoard(columns);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "user", password: "password" }),
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/board",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ columns }),
      }),
    );
  });

  it("exposes API error details and falls back to the HTTP status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCurrentUser()).rejects.toMatchObject({
      name: "ApiError",
      message: "Unauthorized",
      status: 401,
    });
    await expect(getBoard()).rejects.toMatchObject({
      name: "ApiError",
      message: "Request failed with status 503.",
      status: 503,
    });
    expect(new ApiError("error", 400)).toBeInstanceOf(Error);
  });

  it("surfaces malformed success responses and network errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBoard()).rejects.toThrow("The server returned invalid JSON.");
    await expect(getBoard()).rejects.toThrow("offline");
  });
});
