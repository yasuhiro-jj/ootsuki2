import type { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <section
      className={`rounded-[28px] border border-stone-900/10 bg-white/85 p-6 shadow-[0_18px_50px_rgba(120,53,15,0.08)] ${className}`}
    >
      {title ? <h3 className="text-xl font-bold tracking-tight">{title}</h3> : null}
      {description ? (
        <p className="mt-2 text-sm leading-7 text-stone-600">{description}</p>
      ) : null}
      <div className={title || description ? "mt-6" : ""}>{children}</div>
    </section>
  );
}
