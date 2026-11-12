"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import {
  Bell,
  CircleHelp,
  Check,
  GripVertical,
  Inbox,
  LayoutDashboard,
  Layers3,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  addColumn,
  addCard,
  countCards,
  deleteCard,
  moveCard,
  renameColumn,
  updateCard,
  type Board,
  type Card,
  type Column,
} from "@/lib/board";
import {
  ApiError,
  getBoard,
  getCurrentUser,
  login,
  logout,
  saveBoard,
  type User,
} from "@/lib/api";

const columnDropPrefix = "column:";

type AuthStatus = "loading" | "anonymous" | "authenticated" | "error";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof SyntaxError) return "پاسخ سرور قابل‌خواندن نیست.";
  if (error instanceof TypeError) return "ارتباط با سرور برقرار نشد.";
  if (error instanceof Error) return error.message;
  return "خطای غیرمنتظره‌ای رخ داد.";
}

const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const cardCollisions = pointerCollisions.filter(
    ({ id }) =>
      String(id) !== String(args.active.id) &&
      !String(id).startsWith(columnDropPrefix),
  );
  if (cardCollisions.length > 0) return cardCollisions;

  const columnCollisions = pointerCollisions.filter(({ id }) =>
    String(id).startsWith(columnDropPrefix),
  );
  return columnCollisions.length > 0
    ? columnCollisions
    : closestCorners(args);
};

export default function Home() {
  const [board, setBoard] = useState<Board>([]);
  const [boardTitle, setBoardTitle] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [isLoginPending, setIsLoginPending] = useState(false);
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const boardRef = useRef<Board>([]);
  const savingRef = useRef(false);
  const boardColumnsRef = useRef<HTMLDivElement>(null);
  const boardStyle: CSSProperties & { "--column-count": number } = {
    "--column-count": board.length + 1,
  };
  useEffect(() => {
    let active = true;

    async function restoreSession() {
      setAuthStatus("loading");
      setSessionError(null);
      try {
        const user = await getCurrentUser();
        const savedBoard = await getBoard();
        if (!active) return;

        setCurrentUser(user);
        setBoard(savedBoard.columns);
        boardRef.current = savedBoard.columns;
        setBoardTitle(savedBoard.title);
        setAuthStatus("authenticated");
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setCurrentUser(null);
          setBoard([]);
          boardRef.current = [];
          setAuthStatus("anonymous");
        } else {
          setSessionError(getErrorMessage(error));
          setAuthStatus("error");
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, [sessionAttempt]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const activeCard = board
    .flatMap((column) => column.cards)
    .find((card) => card.id === activeCardId);

  async function handleLogin(username: string, password: string) {
    setLoginError(null);
    setIsLoginPending(true);
    try {
      const user = await login(username, password);
      const savedBoard = await getBoard();
      setCurrentUser(user);
      setBoard(savedBoard.columns);
      boardRef.current = savedBoard.columns;
      setBoardTitle(savedBoard.title);
      setAuthStatus("authenticated");
    } catch (error) {
      setLoginError(
        error instanceof ApiError && error.status === 401
          ? "نام کاربری یا گذرواژه نادرست است."
          : getErrorMessage(error),
      );
    } finally {
      setIsLoginPending(false);
    }
  }

  async function handleLogout() {
    if (savingRef.current) return;
    setBoardError(null);
    setIsLogoutPending(true);
    try {
      await logout();
      setCurrentUser(null);
      setBoard([]);
      boardRef.current = [];
      setLoginError(null);
      setAuthStatus("anonymous");
    } catch (error) {
      setBoardError(getErrorMessage(error));
    } finally {
      setIsLogoutPending(false);
    }
  }

  async function persistBoard(nextBoard: Board): Promise<boolean> {
    if (savingRef.current) return false;
    savingRef.current = true;
    setIsSaving(true);
    setBoardError(null);
    try {
      const savedBoard = await saveBoard(nextBoard);
      setBoard(savedBoard.columns);
      boardRef.current = savedBoard.columns;
      setBoardTitle(savedBoard.title);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setCurrentUser(null);
        setBoard([]);
        boardRef.current = [];
        setLoginError("نشست شما پایان یافته است. دوباره وارد شوید.");
        setAuthStatus("anonymous");
      } else {
        setBoardError(getErrorMessage(error));
      }
      return false;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null);
    if (!event.over) return;

    const overId = String(event.over.id);
    const destinationColumn = boardRef.current.find(
      (column) =>
        `${columnDropPrefix}${column.id}` === overId ||
        column.cards.some((card) => card.id === overId),
    );
    if (!destinationColumn) return;

    const beforeCardId = destinationColumn.cards.some(
      (card) => card.id === overId,
    )
      ? overId
      : undefined;
    await persistBoard(
      moveCard(
        boardRef.current,
        String(event.active.id),
        destinationColumn.id,
        beforeCardId,
      ),
    );
  }

  function handleAddCard(
    columnId: string,
    title: string,
    details: string,
  ): Promise<boolean> {
    return persistBoard(
      addCard(boardRef.current, columnId, {
        id: crypto.randomUUID(),
        title,
        details,
      }),
    );
  }

  function handleUpdateCard(
    cardId: string,
    title: string,
    details: string,
  ): Promise<boolean> {
    return persistBoard(
      updateCard(boardRef.current, cardId, { title, details }),
    );
  }

  function handleDeleteCard(cardId: string): Promise<boolean> {
    return persistBoard(deleteCard(boardRef.current, cardId));
  }

  function handleRenameColumn(
    columnId: string,
    name: string,
  ): Promise<boolean> {
    return persistBoard(renameColumn(boardRef.current, columnId, name));
  }

  async function handleAddColumn(name: string): Promise<boolean> {
    const columnName = name.trim();
    if (!columnName) return false;

    const saved = await persistBoard(
      addColumn(boardRef.current, {
        id: crypto.randomUUID(),
        name: columnName,
        cards: [],
      }),
    );
    if (saved) {
      setIsAddingColumn(false);
      requestAnimationFrame(() => {
        const columns = boardColumnsRef.current;
        columns?.scrollTo({ left: -columns.scrollWidth, behavior: "smooth" });
      });
    }
    return saved;
  }

  if (authStatus === "loading") {
    return <StatusScreen message="در حال بررسی نشست و بارگذاری برد..." />;
  }

  if (authStatus === "error") {
    return (
      <StatusScreen
        message={sessionError ?? "بارگذاری برنامه ناموفق بود."}
        actionLabel="تلاش دوباره"
        onAction={() => setSessionAttempt((attempt) => attempt + 1)}
      />
    );
  }

  if (authStatus === "anonymous") {
    return (
      <LoginForm
        error={loginError}
        isPending={isLoginPending}
        onSubmit={handleLogin}
      />
    );
  }

  if (!currentUser) {
    return <StatusScreen message="اطلاعات نشست در دسترس نیست." />;
  }

  return (
    <div className="app-shell" dir="ltr">
      <header className="topbar">
        <Link
          className="brand"
          href="/"
          aria-label="مدیر پروژه، صفحهٔ اصلی"
          dir="rtl"
        >
          <span className="brand-mark" aria-hidden="true">
            <Image
              className="brand-logo"
              src="/project-manager-logo.svg"
              width={34}
              height={34}
              alt=""
              priority
            />
          </span>
          <span className="brand-name">مدیر پروژه</span>
        </Link>
        <div className="topbar-context" dir="rtl">
          <span>فضای کاری</span>
          <span className="context-divider">/</span>
          <strong>استودیو محصول</strong>
        </div>
        <div className="topbar-actions">
          <span className="topbar-icon" aria-label="راهنما">
            <CircleHelp size={17} />
          </span>
          <span className="topbar-icon" aria-label="اعلان‌ها">
            <Bell size={17} />
          </span>
          <span className="workspace-avatar" aria-label={currentUser.username}>
            {currentUser.username.slice(0, 1).toLocaleUpperCase()}
          </span>
          <button
            className="logout-button"
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLogoutPending || isSaving}
          >
            <LogOut size={15} />
            خروج
          </button>
        </div>
      </header>

      <div className="workspace-shell">
        <aside className="sidebar" dir="rtl">
          <div className="sidebar-workspace">
            <span className="sidebar-workspace-icon">
              <Layers3 size={17} />
            </span>
            <div className="sidebar-workspace-copy">
              <span className="sidebar-eyebrow">فضای کاری</span>
              <strong>استودیو محصول</strong>
            </div>
            <MoreHorizontal className="sidebar-more" size={18} />
          </div>

          <div className="sidebar-section-label">فضای کاری شما</div>
          <Link className="sidebar-board-link" href="#board">
            <span className="sidebar-link-icon">
              <Inbox size={17} />
            </span>
            <span>{boardTitle}</span>
            <span className="sidebar-link-count">{countCards(board)}</span>
          </Link>

          <div className="sidebar-note">
            <div className="sidebar-note-mark">
              <LayoutDashboard size={16} />
            </div>
            <strong>قدم بعدی، همین‌جاست</strong>
            <p>کارت‌ها را بین ستون‌ها جابه‌جا کنید و پیشرفت تیم را ببینید.</p>
          </div>

          <div className="sidebar-bottom">
            <span className="sidebar-bottom-dot" />
            <span>یک تخته، مسیر پیشرفت</span>
          </div>
        </aside>

        <main
          className="workspace-main"
          dir="rtl"
          id="board"
          aria-busy={isSaving}
          inert={isSaving}
        >
          <div className="board-header">
            <div className="board-heading">
              <div className="board-breadcrumb">
                استودیو محصول <span>/</span> تخته‌ها
              </div>
              <h1 className="heading-title" id="page-title">
                {boardTitle}
              </h1>
            </div>
            <div className="board-header-meta">
              <div className="member-stack" aria-label={currentUser.username}>
                <span className="member-avatar member-avatar-one">
                  {currentUser.username.slice(0, 1).toLocaleUpperCase()}
                </span>
              </div>
              <span className="board-meta-divider" />
              <div className="board-stat">
                <span>کارت‌ها</span>
                <strong data-testid="card-count">{countCards(board)}</strong>
              </div>
              <span className="board-meta-divider" />
              <div className="board-stat">
                <span>ستون‌ها</span>
                <strong>{board.length.toLocaleString("fa-IR")}</strong>
              </div>
            </div>
          </div>

          {boardError && (
            <p className="board-error" role="alert">
              {boardError}
            </p>
          )}

          <section className="board-canvas" aria-labelledby="board-title">
            <div className="board-toolbar">
              <div className="board-title-group">
                <span className="board-title-icon">
                  <Layers3 size={17} />
                </span>
                <span>
                  <h2 className="board-title" id="board-title">
                    نمای کلی کارها
                  </h2>
                  <p className="board-subtitle">
                    {board.length.toLocaleString("fa-IR")} مرحله از ایده تا اجرا
                  </p>
                </span>
              </div>
              <div className="board-toolbar-actions">
                {isSaving && (
                  <p className="save-status" role="status">
                    در حال ذخیره...
                  </p>
                )}
                <p className="drag-hint">
                  <GripVertical size={15} />
                  برای جابه‌جایی، کارت را بکشید
                </p>
              </div>
            </div>

            <DndContext
              id="kanban-board"
              sensors={sensors}
              collisionDetection={boardCollisionDetection}
              onDragStart={(event) => setActiveCardId(String(event.active.id))}
              onDragCancel={() => setActiveCardId(null)}
              onDragEnd={handleDragEnd}
            >
              <div
                className="board-columns"
                data-testid="board-columns"
                ref={boardColumnsRef}
                style={boardStyle}
              >
                {board.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    onAddCard={handleAddCard}
                    onUpdateCard={handleUpdateCard}
                    onDeleteCard={handleDeleteCard}
                    onRename={(name) => handleRenameColumn(column.id, name)}
                  />
                ))}
                <div className="add-column-slot">
                  {isAddingColumn ? (
                    <AddColumnForm
                      onSubmit={handleAddColumn}
                      onCancel={() => setIsAddingColumn(false)}
                    />
                  ) : (
                    <button
                      className="add-column-button"
                      type="button"
                      aria-label="افزودن ستون دیگر"
                      onClick={() => setIsAddingColumn(true)}
                    >
                      <Plus size={17} />
                      افزودن ستون دیگر
                    </button>
                  )}
                </div>
              </div>
              <DragOverlay>
                {activeCard ? <CardPreview card={activeCard} /> : null}
              </DragOverlay>
            </DndContext>
            <footer className="board-footer">
              <span className="board-footer-dot" />
              همه‌چیز با یک قدم کوچک شروع می‌شود.
            </footer>
          </section>
        </main>
      </div>
    </div>
  );
}

function StatusScreen({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="status-page" dir="rtl">
      <section className="status-card" role="status" aria-live="polite">
        <Image
          className="auth-logo"
          src="/project-manager-logo.svg"
          width={48}
          height={48}
          alt=""
          priority
        />
        <p>{message}</p>
        {actionLabel && onAction && (
          <button className="auth-submit" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  );
}

function LoginForm({
  error,
  isPending,
  onSubmit,
}: {
  error: string | null;
  isPending: boolean;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(username.trim(), password);
  }

  return (
    <main className="status-page" dir="rtl">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Image
          className="auth-logo"
          src="/project-manager-logo.svg"
          width={48}
          height={48}
          alt=""
          priority
        />
        <p className="auth-eyebrow">مدیریت پروژه</p>
        <h1>ورود به فضای کاری</h1>
        <p className="auth-description">برای مشاهدهٔ برد کانبان وارد شوید.</p>
        <label className="auth-label" htmlFor="username">
          نام کاربری
        </label>
        <input
          id="username"
          className="auth-input"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <label className="auth-label" htmlFor="password">
          گذرواژه
        </label>
        <input
          id="password"
          className="auth-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-submit" type="submit" disabled={isPending}>
          <LogIn size={16} />
          {isPending ? "در حال ورود..." : "ورود"}
        </button>
      </form>
    </main>
  );
}

function AddColumnForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) await onSubmit(trimmedName);
  }

  return (
    <form className="add-column-form" onSubmit={handleSubmit}>
      <input
        className="column-name-input"
        aria-label="نام ستون جدید"
        placeholder="نام ستون"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        required
      />
      <button className="add-column-submit" type="submit">
        افزودن
      </button>
      <button
        className="add-column-cancel"
        type="button"
        aria-label="انصراف از افزودن ستون"
        onClick={onCancel}
      >
        انصراف
      </button>
    </form>
  );
}

interface KanbanColumnProps {
  column: Column;
  onAddCard: (
    columnId: string,
    title: string,
    details: string,
  ) => Promise<boolean>;
  onUpdateCard: (
    cardId: string,
    title: string,
    details: string,
  ) => Promise<boolean>;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onRename: (name: string) => Promise<boolean>;
}

function KanbanColumn({
  column,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onRename,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${columnDropPrefix}${column.id}`,
  });
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onRename(nameDraft)) setIsEditingName(false);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setNameDraft(column.name);
      setIsEditingName(false);
    }
  }

  return (
    <section
      className={`kanban-column${isOver ? " is-over" : ""}`}
      data-testid={`kanban-column-${column.id}`}
      aria-labelledby={`column-heading-${column.id}`}
    >
      <header className="column-header">
        <div className="column-name-wrap">
          <span className="column-color" />
          {isEditingName ? (
            <form
              className="column-name-form"
              onSubmit={(event) => {
                saveName(event);
              }}
            >
              <input
                aria-label="نام ستون"
                className="column-name-input"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={handleNameKeyDown}
                autoFocus
              />
            </form>
          ) : (
            <h3 className="column-name" id={`column-heading-${column.id}`}>
              {column.name}
            </h3>
          )}
        </div>
        <span className="column-count" aria-label={`${column.cards.length} کارت`}>
          {column.cards.length}
        </span>
        <button
          className="icon-button"
          type="button"
          aria-label={`تغییر نام ستون ${column.name}`}
          title="تغییر نام ستون"
          onClick={() => {
            setNameDraft(column.name);
            setIsEditingName(true);
          }}
        >
          <Pencil size={14} />
        </button>
      </header>

      <SortableContext
        items={column.cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          className="card-list"
          ref={setNodeRef}
          data-column-id={column.id}
          data-testid="card-list"
        >
          {column.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              onEdit={(title, details) =>
                onUpdateCard(card.id, title, details)
              }
              onDelete={() => onDeleteCard(card.id)}
            />
          ))}
          {column.cards.length === 0 && (
            <p className="empty-column">هنوز کارتی در این ستون نیست.</p>
          )}
        </div>
      </SortableContext>

      {isAddingCard ? (
        <CardForm
          submitLabel="ثبت کارت"
          onSubmit={async (title, details) => {
            const saved = await onAddCard(column.id, title, details);
            if (saved) {
              setIsAddingCard(false);
            }
            return saved;
          }}
          onCancel={() => setIsAddingCard(false)}
        />
      ) : (
        <button
          className="add-card-button"
          type="button"
          aria-label={`افزودن کارت به ${column.name}`}
          onClick={() => setIsAddingCard(true)}
        >
          <Plus size={15} />
          افزودن کارت
        </button>
      )}
    </section>
  );
}

interface CardFormProps {
  initialTitle?: string;
  initialDetails?: string;
  submitLabel: string;
  onSubmit: (title: string, details: string) => Promise<boolean>;
  onCancel: () => void;
}

function CardForm({
  initialTitle = "",
  initialDetails = "",
  submitLabel,
  onSubmit,
  onCancel,
}: CardFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [details, setDetails] = useState(initialDetails);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    await onSubmit(trimmedTitle, details.trim());
  }

  return (
    <form
      className={initialTitle ? "edit-card-form" : "add-card-form"}
      aria-label={initialTitle ? `ویرایش کارت ${initialTitle}` : undefined}
      onSubmit={handleSubmit}
    >
      <input
        aria-label="عنوان کارت"
        className="form-field"
        placeholder="عنوان کارت"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        autoFocus
      />
      <textarea
        aria-label="جزئیات کارت"
        className="form-field details-field"
        placeholder="جزئیات"
        value={details}
        onChange={(event) => setDetails(event.target.value)}
      />
      <div className="form-actions">
        <button className="submit-button" type="submit">
          <Check size={14} />
          {submitLabel}
        </button>
        <button className="cancel-button" type="button" onClick={onCancel}>
          انصراف
        </button>
      </div>
    </form>
  );
}

interface SortableCardProps {
  card: Card;
  onEdit: (title: string, details: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

function SortableCard({ card, onEdit, onDelete }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });
  const [isEditing, setIsEditing] = useState(false);

  return (
    <article
      className={`task-card${isDragging ? " is-dragging" : ""}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      data-testid={`kanban-card-${card.id}`}
    >
      {isEditing ? (
        <CardForm
          initialTitle={card.title}
          initialDetails={card.details}
          submitLabel="ذخیره تغییرات"
          onSubmit={async (title, details) => {
            const saved = await onEdit(title, details);
            if (saved) setIsEditing(false);
            return saved;
          }}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <div className="card-actions">
            <button
              className="icon-button drag-handle"
              type="button"
              aria-label={`جابجایی کارت ${card.title}`}
              data-testid="drag-handle"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={16} />
            </button>
            <div className="card-action-buttons">
              <button
                className="icon-button edit-button"
                type="button"
                aria-label={`ویرایش کارت ${card.title}`}
                title="ویرایش کارت"
                onClick={() => setIsEditing(true)}
              >
                <Pencil size={14} />
              </button>
              <button
                className="icon-button delete-button"
                type="button"
                aria-label={`حذف کارت ${card.title}`}
                title="حذف کارت"
                onClick={() => void onDelete()}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <h4 className="card-title">{card.title}</h4>
          {card.details && <p className="card-details">{card.details}</p>}
        </>
      )}
    </article>
  );
}

function CardPreview({ card }: { card: Card }) {
  return (
    <article className="task-card drag-overlay" aria-hidden="true">
      <h4 className="card-title">{card.title}</h4>
      {card.details && <p className="card-details">{card.details}</p>}
    </article>
  );
}
