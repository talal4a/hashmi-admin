"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import NextLink from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "navy"
  | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--hm-cyan-500)] text-white hover:bg-[var(--hm-cyan-600)] shadow-[var(--hm-shadow-cyan)] border-transparent",
  secondary:
    "bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)] hover:bg-[var(--hm-cyan-100)] border-[var(--hm-cyan-100)]",
  outline:
    "bg-white text-[var(--hm-ink-700)] border-[var(--hm-border)] hover:border-[var(--hm-cyan-300)] hover:text-[var(--hm-cyan-700)]",
  ghost: "bg-transparent text-[var(--hm-ink-700)] border-transparent hover:bg-[var(--hm-ink-100)]",
  danger: "bg-[var(--hm-danger-500)] text-white hover:bg-[var(--hm-danger-700)] border-transparent",
  navy: "bg-[var(--hm-navy-800)] text-white hover:bg-[var(--hm-navy-700)] border-transparent",
  subtle: "bg-[var(--hm-ink-100)] text-[var(--hm-ink-700)] hover:bg-[var(--hm-ink-200)] border-transparent",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[9px]",
  md: "h-9.5 px-4 text-[13.5px] gap-2 rounded-[var(--hm-radius-control)]",
  lg: "h-11 px-5 text-[14.5px] gap-2 rounded-[var(--hm-radius-control-lg)]",
  icon: "h-9 w-9 p-0 rounded-[var(--hm-radius-control)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex items-center justify-center border font-semibold whitespace-nowrap",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--hm-dur-fast)]",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

/** Anchor styled exactly like Button — for navigation rather than actions. */
export function LinkButton({
  href,
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <NextLink
      href={href}
      className={cn(
        "relative inline-flex items-center justify-center border font-semibold whitespace-nowrap",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--hm-dur-fast)]",
        "active:translate-y-px",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </NextLink>
  );
}
