"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  idleLabel: string;
  pendingLabel: string;
}

export function SubmitButton({ idleLabel, pendingLabel }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex w-fit rounded-full bg-stone-950 px-6 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-80"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
