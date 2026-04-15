import type { MinimalPageBlock } from "@/types/notion";

export function ProjectContent({ blocks }: { blocks: MinimalPageBlock[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-stone-500">表示できる本文ブロックはまだありません。</p>;
  }

  return (
    <div className="space-y-3 text-sm leading-7 text-stone-700">
      {blocks.map((block) => {
        if (block.type === "heading_1") {
          return (
            <h2 key={block.id} className="text-2xl font-bold text-stone-900">
              {block.text}
            </h2>
          );
        }

        if (block.type === "heading_2") {
          return (
            <h3 key={block.id} className="pt-2 text-xl font-bold text-stone-900">
              {block.text}
            </h3>
          );
        }

        if (block.type === "heading_3") {
          return (
            <h4 key={block.id} className="pt-1 text-base font-bold text-stone-900">
              {block.text}
            </h4>
          );
        }

        if (block.type === "bulleted_list_item") {
          return (
            <div key={block.id} className="flex gap-3">
              <span className="mt-2 h-2 w-2 rounded-full bg-orange-500" />
              <p>{block.text}</p>
            </div>
          );
        }

        return <p key={block.id}>{block.text}</p>;
      })}
    </div>
  );
}
