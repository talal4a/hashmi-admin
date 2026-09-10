import { twMerge } from "tailwind-merge";

type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[]
  | Record<string, boolean | undefined | null>;

/**
 * Combines class names and resolves conflicting Tailwind utilities so the last
 * one wins.
 *
 * Plain concatenation is not enough: a component that sets `w-full` in its base
 * classes would otherwise beat a caller passing `w-auto`, because the winner is
 * decided by Tailwind's stylesheet order rather than by the order they appear
 * in the attribute. That silently broke toolbar layouts before this was added.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue) => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (typeof value === "object") {
      for (const [key, on] of Object.entries(value)) if (on) out.push(key);
    }
  };
  inputs.forEach(walk);
  return twMerge(out.join(" "));
}
