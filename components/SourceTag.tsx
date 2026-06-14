const STYLES: Record<string, string> = {
  paper: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  chat: "bg-amber-50 text-amber-700 ring-amber-200",
  report: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const LABELS: Record<string, string> = {
  paper: "Paper",
  chat: "Discussion",
  report: "Report",
};

export function SourceTag({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        STYLES[type] ?? "bg-stone-100 text-stone-600 ring-stone-200"
      }`}
    >
      {LABELS[type] ?? type}
    </span>
  );
}
