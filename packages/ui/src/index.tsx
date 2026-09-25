import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { Intent, Tone } from "../../../design-system/component-contracts";

export { ThemeProvider, useTheme } from "./theme";
export type { ThemePreference } from "./theme";

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "style" | "color" | "className"
> & {
  intent?: Intent;
  busy?: boolean;
  disabledReason?: string;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      intent = "secondary",
      busy = false,
      disabled = false,
      disabledReason,
      children,
      onClick,
      type = "button",
      ...props
    },
    ref,
  ) {
    const blocked = disabled || busy;
    return (
      <span className="ieum-button-wrap">
        <button
          {...props}
          ref={ref}
          type={type}
          className="ieum-button"
          data-variant={intent}
          data-loading={busy}
          aria-busy={busy}
          aria-disabled={blocked}
          disabled={disabled}
          onClick={(event) => {
            if (blocked) {
              event.preventDefault();
              return;
            }
            onClick?.(event);
          }}
        >
          {busy ? "처리 중…" : children}
        </button>
        {disabledReason && (
          <small className="ieum-help">{disabledReason}</small>
        )}
      </span>
    );
  },
);

type FieldMeta = { label: string; error?: string; help?: string };
function descriptionIds(id: string, error?: string, help?: string) {
  return (
    [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") ||
    undefined
  );
}
function Description({
  id,
  error,
  help,
}: {
  id: string;
  error?: string | undefined;
  help?: string | undefined;
}) {
  return (
    <>
      {help && (
        <p id={`${id}-help`} className="ieum-help">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ieum-error">
          {error}
        </p>
      )}
    </>
  );
}

export const Field = forwardRef<
  HTMLInputElement,
  FieldMeta &
    Omit<InputHTMLAttributes<HTMLInputElement>, "style" | "className" | "color">
>(function Field({ label, error, help, id, ...props }, ref) {
  const auto = useId();
  const key = id ?? auto;
  return (
    <div className="ieum-stack-small">
      <label className="ieum-label" htmlFor={key}>
        {label}
      </label>
      <input
        {...props}
        ref={ref}
        id={key}
        className="ieum-field"
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptionIds(key, error, help)}
      />
      <Description id={key} error={error} help={help} />
    </div>
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  FieldMeta &
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "style" | "className">
>(function TextArea({ label, error, help, id, ...props }, ref) {
  const auto = useId();
  const key = id ?? auto;
  return (
    <div className="ieum-stack-small">
      <label className="ieum-label" htmlFor={key}>
        {label}
      </label>
      <textarea
        {...props}
        ref={ref}
        id={key}
        className="ieum-field ieum-editor"
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptionIds(key, error, help)}
      />
      <Description id={key} error={error} help={help} />
    </div>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  FieldMeta &
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "style" | "className">
>(function Select({ label, error, help, id, children, ...props }, ref) {
  const auto = useId();
  const key = id ?? auto;
  return (
    <div className="ieum-stack-small">
      <label className="ieum-label" htmlFor={key}>
        {label}
      </label>
      <select
        {...props}
        ref={ref}
        id={key}
        className="ieum-field"
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptionIds(key, error, help)}
      >
        {children}
      </select>
      <Description id={key} error={error} help={help} />
    </div>
  );
});

type CheckProps = { label: string; indeterminate?: boolean } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "style" | "className" | "type"
>;
export const Check = forwardRef<HTMLInputElement, CheckProps>(function Check(
  { label, indeterminate = false, ...props },
  forwardedRef,
) {
  const ownRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ownRef.current) ownRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="ieum-check">
      <input
        {...props}
        ref={(node) => {
          ownRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        type="checkbox"
        aria-checked={indeterminate ? "mixed" : undefined}
      />
      {label}
    </label>
  );
});

export function Status({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className="ieum-status" data-tone={tone}>
      {children}
    </span>
  );
}
export function Notice({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      className="ieum-notice"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="ieum-card">
      {title && (
        <header>
          <h2>{title}</h2>
        </header>
      )}
      <div className="ieum-pad ieum-stack">{children}</div>
    </section>
  );
}
export function Page({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ieum-stack">
      <header className="ieum-page-heading">
        <div>
          {eyebrow && <p className="ieum-kicker">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
        {actions && <div className="ieum-cluster">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
export function Stack({ children }: { children: ReactNode }) {
  return <div className="ieum-stack">{children}</div>;
}
export function Cluster({ children }: { children: ReactNode }) {
  return <div className="ieum-cluster">{children}</div>;
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <p className="ieum-empty">{children}</p>
    </Card>
  );
}

export function Table({
  caption,
  columns,
  rows,
  emptyMessage = "표시할 항목이 없습니다.",
}: {
  caption: string;
  columns: readonly { key: string; label: string }[];
  rows: readonly {
    id: string;
    cells: Readonly<Record<string, ReactNode>>;
    selected?: boolean;
  }[];
  emptyMessage?: string;
}) {
  return (
    <div className="ieum-table-wrap">
      <table className="ieum-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id} aria-selected={row.selected || undefined}>
                {columns.map((column) => (
                  <td key={column.key}>{row.cells[column.key]}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      if (openerRef.current?.isConnected) openerRef.current.focus();
    }
    return () => {
      if (dialog.open) dialog.close();
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className="ieum-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ieum-stack">
        <header className="ieum-page-heading">
          <h2 id={titleId}>{title}</h2>
          <Button intent="ghost" onClick={onClose} data-autofocus>
            닫기
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
