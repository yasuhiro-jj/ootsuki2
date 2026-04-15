"use client";

import { useFormStatus } from "react-dom";

export function ProjectUpdateSubmit() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
    >
      {pending ? "更新中..." : "Notionへ更新する"}
    </button>
  );
}
