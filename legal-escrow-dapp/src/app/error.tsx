'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl border border-red-200 shadow p-8 max-w-sm w-full text-center">
        <p className="text-red-600 font-semibold mb-2">Something went wrong</p>
        <p className="text-sm text-slate-500 mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
