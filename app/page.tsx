import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-zinc-50 dark:bg-zinc-950">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm flex flex-col gap-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dos Tazas POS
        </h1>
        <div className="flex gap-4">
          <Link
            href="/pos/floor"
            className="px-6 py-3 bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 rounded-md font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Open POS
          </Link>
          <Link
            href="/admin"
            className="px-6 py-3 bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50 border border-zinc-200 dark:border-zinc-800 rounded-md font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Admin Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
