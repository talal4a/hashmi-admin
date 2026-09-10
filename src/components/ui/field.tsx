"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const CONTROL =
  "w-full rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-white px-3 text-[13.5px] text-[var(--hm-ink-900)] placeholder:text-[var(--hm-ink-400)] transition-colors duration-[var(--hm-dur-fast)] hover:border-[var(--hm-border-strong)] focus:border-[var(--hm-cyan-400)] focus:outline-none focus:ring-2 focus:ring-[var(--hm-cyan-100)] disabled:cursor-not-allowed disabled:bg-[var(--hm-ink-50)] disabled:text-[var(--hm-ink-500)]";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className,
  action,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[12.5px] font-semibold text-[var(--hm-ink-700)]"
        >
          {label}
          {required ? <span className="ml-0.5 text-[var(--hm-danger-500)]">*</span> : null}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-[12px] font-medium text-[var(--hm-danger-700)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-[var(--hm-ink-500)]">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          "h-9.5",
          invalid && "border-[var(--hm-danger-500)] focus:ring-[var(--hm-danger-100)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        "resize-y py-2 leading-relaxed",
        invalid && "border-[var(--hm-danger-500)] focus:ring-[var(--hm-danger-100)]",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        "h-9.5 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
        invalid && "border-[var(--hm-danger-500)]",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="flex items-start gap-3">
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 inline-flex h-5.5 w-10 shrink-0 items-center rounded-full border transition-colors duration-[var(--hm-dur-fast)] disabled:opacity-50",
          checked
            ? "border-[var(--hm-cyan-500)] bg-[var(--hm-cyan-500)]"
            : "border-[var(--hm-border-strong)] bg-[var(--hm-ink-200)]",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white shadow-sm transition-transform duration-[var(--hm-dur-fast)]",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      <label htmlFor={inputId} className="cursor-pointer select-none">
        <span className="block text-[13px] font-semibold text-[var(--hm-ink-800)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] text-[var(--hm-ink-500)]">{description}</span>
        ) : null}
      </label>
    </div>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked" | "type">) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate) && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      className={cn(
        "size-4 cursor-pointer rounded-[5px] border-[var(--hm-border-strong)] accent-[var(--hm-cyan-500)]",
        className,
      )}
      {...rest}
    />
  );
}
