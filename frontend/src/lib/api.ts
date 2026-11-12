import type { Board } from "./board";

export interface User {
  id: string;
  username: string;
}

export interface BoardResponse {
  id: string;
  title: string;
  columns: Board;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    if (response.ok) throw new Error("The server returned invalid JSON.");
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed with status ${response.status}.`;
    throw new ApiError(detail, response.status);
  }

  return payload as T;
}

export function getCurrentUser(): Promise<User> {
  return request<User>("/api/auth/me");
}

export function login(username: string, password: string): Promise<User> {
  return request<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await request<{ status: string }>("/api/auth/logout", { method: "POST" });
}

export function getBoard(): Promise<BoardResponse> {
  return request<BoardResponse>("/api/board");
}

export function saveBoard(columns: Board): Promise<BoardResponse> {
  return request<BoardResponse>("/api/board", {
    method: "PUT",
    body: JSON.stringify({ columns }),
  });
}
