import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Error message to show below the select */
  error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="w-full">
        <select
          ref={ref}
          className={cn(
            // Base
            "w-full h-11 rounded-lg border px-3 text-sm transition-all",
            // Colors – brand tokens (dark-mode aware)
            "bg-card text-expresso",
            // Border
            "border-warm-roast/20",
            // Focus
            "focus:outline-none focus:ring-2 focus:ring-coffee-fruit/30 focus:border-coffee-fruit",
            // Disabled
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted",
            // Error
            error && "border-destructive focus:ring-destructive/20 focus:border-destructive",
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p className="mt-1.5 text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
