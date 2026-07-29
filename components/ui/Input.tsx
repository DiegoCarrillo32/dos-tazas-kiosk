import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional leading icon (rendered inside the field on the left) */
  icon?: React.ReactNode;
  /** Optional trailing element (rendered inside the field on the right, e.g. a password toggle) */
  rightElement?: React.ReactNode;
  /** Error message to show below the input */
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, rightElement, error, type, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-expresso/40 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              // Base
              "w-full rounded-lg border px-3 py-2.5 text-sm transition-all",
              // Colors – brand tokens (dark-mode aware)
              "bg-card text-expresso placeholder:text-expresso/40",
              // Border
              "border-warm-roast/20",
              // Focus
              "focus:outline-none focus:ring-2 focus:ring-coffee-fruit/30 focus:border-coffee-fruit",
              // Disabled
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted",
              // Error
              error && "border-destructive focus:ring-destructive/20 focus:border-destructive",
              // Icon padding
              icon && "pl-10",
              rightElement && "pr-10",
              className
            )}
            {...props}
          />
          {rightElement && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              {rightElement}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
