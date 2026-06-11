---
name: dos-tazas-styling
description: Styling guide for the Dos Tazas POS app (this repo). Consult before writing or editing any UI here — pages, components, modals, forms, cards, buttons, badges, or any JSX with className. It covers this repo's concrete stack (Next.js App Router + Tailwind v3 + brand tokens) and conventions. For the shared Dos Tazas brand identity (palette/fonts/shape), this builds on the global `dos-tazas-brand` skill.
---

# Dos Tazas POS — Styling Guide

This is the **POS** app (Floor = order taking, Counter = checkout, plus an Admin portal). It shares the Dos Tazas brand identity defined in the global **`dos-tazas-brand`** skill — read that for the palette, fonts, and shape language. This file documents how that brand is wired **in this specific repo**, which differs from the sibling `dos-tazas-management` app.

> Migration status: the brand tokens and fonts are installed, but most existing screens still use generic `zinc-*` utilities from an earlier theme. When you create or edit UI, prefer the brand/semantic tokens below; migrate screens to the brand incrementally rather than all at once.

## Stack (this repo)

- **Next.js 16 App Router**, routes under `app/` (NOT `src/app/`). React 19.
- **Tailwind CSS v3** with a real config file: `tailwind.config.ts`. Tokens are CSS variables in `app/globals.css` (NOT a Tailwind v4 `@theme` block).
- **lucide-react** icons, **recharts** for charts, **@tanstack/react-query** for data.
- No shadcn CLI, no `@base-ui`/Radix, no `class-variance-authority`, no `sonner`, **no i18n**. Plain English UI strings are fine here (unlike the management app).
- Dark mode is **class-based** (`darkMode: "class"`): an inline script in `app/layout.tsx` plus `components/ui/ThemeToggle.tsx` toggle the `.dark` class on `<html>`.

## Brand tokens (how they're wired here)

Colors live in `app/globals.css` as **space-separated RGB channels** (e.g. `--expresso: 65 5 5;`) inside `:root` and `.dark`, and are exposed in `tailwind.config.ts` via `rgb(var(--token) / <alpha-value>)`. That channel format is what makes opacity modifiers work in Tailwind v3.

Available utilities (all support `/opacity` and flip in dark mode automatically — **no `dark:` needed for brand colors**):

- Brand: `text-expresso`, `bg-warm-roast`, `border-coffee-fruit`, `bg-white-pergamino`, `text-fruit-light`, etc. — and opacity variants like `text-expresso/70`, `border-warm-roast/10`.
- Semantic (mapped onto the brand): `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-primary`/`text-primary-foreground`, `bg-secondary`, `text-muted-foreground`, `border-border`, `ring-ring`, etc.

To add a genuinely new token (rare — prefer opacity modifiers): add the RGB-channel var to **both** `:root` and `.dark` in `app/globals.css`, then add `name: withAlpha("--name")` to `tailwind.config.ts`. Never inline hex in JSX.

## Fonts

- **Gotham** (Book + Bold only) is the default body font — applied via the `body` rule in `app/globals.css`; also available as `font-sans`. Self-hosted from `public/assets/fonts/Gotham-Font/`.
- **Titan One** is the display font, exposed as the **`font-heading`** utility (self-hosted from `public/assets/fonts/Titan_One/`).
- Do not add `next/font` or Google Fonts. Since Gotham only ships Book/Bold, use `font-medium`/`font-bold` (not `font-semibold`).
- Headings here are not yet globally forced to Titan One; apply `font-heading` deliberately as you re-skin a screen (e.g. `text-2xl font-heading text-expresso`).

## Component conventions

- UI primitives live in `components/ui/` with **PascalCase** filenames (e.g. `Button.tsx`, `Input.tsx`, `Checkbox.tsx`, `Label.tsx`). Reuse them before hand-rolling new controls. There is no shadcn generator — add primitives by hand, matching the existing forwardRef + `cn()` pattern.
- Always merge classes with **`cn()` from `@/lib/utils`** — never string-concatenate `className`.
- Modals are hand-rolled with a fixed backdrop + centered panel (see the patterns in `app/admin/menu/page.tsx`, `app/pos/floor/page.tsx`'s `ModifierDrawer`); there is no `Dialog`/`GenericModal` primitive.
- Loading uses lucide `Loader2` spinners (`animate-spin`); there is no skeleton library.
- Brand recipe for cards as you migrate: `bg-card rounded-2xl shadow-sm shadow-warm-roast/5 border border-warm-roast/10 p-6`. Prominent CTA: `bg-warm-roast hover:bg-coffee-fruit text-white rounded-full px-6`.

## This is a touch-first POS

It runs mostly on tablets and phones, so responsiveness and touch ergonomics matter (see also the project's mobile-first notes):

- Keep interactive targets ≥ ~40px; the Floor cart steppers and icon buttons use `h-10 w-10` hit areas.
- Test layouts at phone (375px), tablet (~800px), and desktop widths.
- Don't let `fixed` bars overlap the layout's `sm:hidden` bottom tab nav (`app/pos/layout.tsx`).
- `app/layout.tsx` sets a `viewport` with `maximumScale: 1` so inputs don't zoom on focus.

## Quick self-check before finishing UI work

- No raw hex / arbitrary `[#...]` colors — brand or semantic tokens only.
- Depth via opacity modifiers on brand colors; no `dark:` overrides for brand colors.
- New/edited surfaces use the warm card recipe; headings use `font-heading` where re-skinned.
- Classes merged with `cn()`; reused a `components/ui/` primitive where one exists.
- Works in light and dark (toggle is class-based); verified at mobile + tablet widths.
