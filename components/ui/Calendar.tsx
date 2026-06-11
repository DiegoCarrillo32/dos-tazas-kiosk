"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-popover text-popover-foreground [--rdp-accent-color:rgb(var(--coffee-fruit))] [--rdp-accent-background-color:rgb(var(--coffee-fruit)/0.1)]", className)}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
