import * as React from "react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        ref={ref}
        className={cn(
          "h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900",
          "dark:border-zinc-700 dark:bg-zinc-900 dark:ring-offset-zinc-950 dark:checked:bg-zinc-50 dark:checked:border-zinc-50 dark:focus:ring-zinc-50",
          className
        )}
        {...props}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
