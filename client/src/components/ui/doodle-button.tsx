import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "solid" | "outline";
type Size = "sm" | "md";

type DoodleButtonProps = React.ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  /** When set, renders a Next.js link instead of a button. */
  href?: string;
};

const base =
  "group/doodle inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-foreground font-bold tracking-tight " +
  "transition-[translate,rotate,box-shadow] duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] " +
  "hover:-translate-y-0.5 hover:-rotate-1 active:translate-y-0.5 active:rotate-0 active:duration-75 " +
  "focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-offset-4 focus-visible:outline-foreground " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  outline:
    "bg-background text-foreground shadow-[0_3px_0_var(--foreground)] hover:shadow-[0_5px_0_var(--foreground)] active:shadow-[0_1px_0_var(--foreground)]",
  solid:
    "bg-foreground text-background shadow-[0_3px_0_var(--brand,#ff6b2c)] hover:shadow-[0_5px_0_var(--brand,#ff6b2c)] active:shadow-[0_1px_0_var(--brand,#ff6b2c)]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
};

export function DoodleButton({
  variant = "outline",
  size = "md",
  icon,
  href,
  className,
  children,
  ...props
}: DoodleButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], className);

  const content = (
    <>
      {icon && (
        <span className="transition-transform duration-200 group-hover/doodle:-rotate-12 group-hover/doodle:scale-110">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {content}
    </button>
  );
}
