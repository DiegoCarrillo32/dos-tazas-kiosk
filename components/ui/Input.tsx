import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional leading icon (rendered inside the field on the left) */
  icon?: React.ReactNode;
  /** Error message to show below the input */
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, error, type, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              // Base
              "w-full rounded-lg border px-3 py-2.5 text-sm transition-all",
              // Colors – high contrast for readability
              "bg-white text-zinc-900 placeholder:text-zinc-400",
              "dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500",
              // Border
              "border-zinc-300 dark:border-zinc-700",
              // Focus
              "focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900",
              "dark:focus:ring-zinc-50/20 dark:focus:border-zinc-50",
              // Disabled
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:disabled:bg-zinc-950",
              // Error
              error && "border-red-500 dark:border-red-500 focus:ring-red-500/20 focus:border-red-500",
              // Icon padding
              icon && "pl-10",
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
