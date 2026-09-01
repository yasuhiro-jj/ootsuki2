"use client";

interface MonthSelectFormProps {
  months: string[];
  selected: string;
  currentMonthKey: string;
}

export function MonthSelectForm({ months, selected, currentMonthKey }: MonthSelectFormProps) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-3">
      <label htmlFor="month-select" className="text-sm font-medium text-stone-700">
        表示する月
      </label>
      <select
        id="month-select"
        name="month"
        defaultValue={selected}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-xl border border-stone-900/10 bg-white px-3 py-2 text-sm"
      >
        {months.map((key) => (
          <option key={key} value={key}>
            {key}
            {key === currentMonthKey ? "（今月）" : ""}
          </option>
        ))}
      </select>
      <noscript>
        <button
          type="submit"
          className="rounded-xl border border-stone-900/10 bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-stone-100"
        >
          表示
        </button>
      </noscript>
    </form>
  );
}
