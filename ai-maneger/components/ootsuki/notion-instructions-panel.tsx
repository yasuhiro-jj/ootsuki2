import type { NotionInstructionsDocument } from "@/types/ootsuki";

function notionOpenUrl(pageId: string) {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

export function NotionInstructionsPanel(props: { document: NotionInstructionsDocument }) {
  const { document: doc } = props;

  if (!doc.configured) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-7 text-stone-600">
        <p>{doc.body}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-lg font-semibold text-stone-900">{doc.title}</p>
        {doc.pageId ? (
          <a
            href={notionOpenUrl(doc.pageId)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            Notion で開く
          </a>
        ) : null}
      </div>
      <textarea
        readOnly
        value={doc.body}
        rows={Math.min(16, Math.max(6, doc.body.split("\n").length + 2))}
        className="w-full rounded-[24px] border border-stone-900/10 bg-white px-4 py-4 text-sm leading-7 text-stone-700 outline-none"
      />
    </div>
  );
}
