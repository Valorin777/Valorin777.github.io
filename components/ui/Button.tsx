import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet";
export type ButtonSize = "lg" | "md" | "sm";

const base =
  "press inline-flex select-none items-center justify-center gap-2 font-medium whitespace-nowrap disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-1 hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "bg-surface text-text border border-line shadow-1 hover:border-line-strong hover:bg-surface-2",
  quiet: "text-text-2 hover:text-text hover:bg-surface-2",
};

const sizes: Record<ButtonSize, string> = {
  lg: "h-14 px-6 text-base rounded-md",
  md: "h-12 px-5 text-base rounded-md",
  sm: "h-10 px-3.5 text-sm rounded-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "lg", full = false) {
  return `${base} ${variants[variant]} ${sizes[size]} ${full ? "w-full" : ""}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  children: ReactNode;
};

export function Button({ variant = "primary", size = "lg", full = false, className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`${buttonClass(variant, size, full)} ${className}`} {...rest} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
};

export function LinkButton({ variant = "primary", size = "lg", full = false, className = "", ...rest }: LinkButtonProps) {
  return <Link className={`${buttonClass(variant, size, full)} ${className}`} {...rest} />;
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
  tone?: "plain" | "soft";
};

/** 48px square tap target with a visible label for screen readers. */
export function IconButton({ label, children, active = false, tone = "plain", className = "", type = "button", ...rest }: IconButtonProps) {
  const toneClass =
    tone === "soft"
      ? active
        ? "bg-accent text-accent-ink"
        : "bg-accent-soft text-accent-text hover:bg-accent hover:text-accent-ink"
      : active
        ? "text-accent-text bg-accent-soft"
        : "text-text-2 hover:text-text hover:bg-surface-2";
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`press inline-flex size-12 shrink-0 items-center justify-center rounded-full ${toneClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
