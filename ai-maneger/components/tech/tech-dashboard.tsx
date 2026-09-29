"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL } from "@/lib/tech-news/categories";
import { TECH_NEWS_NOTION_URL } from "@/lib/tech-news/notion-ids";
import { TECH_CATEGORIES, type TechArticle, type TechCategory, type TechNewsSnapshot, type TechSourceKind } from "@/lib/tech-news/types";

type SourceFilter = "all" | TechSourceKind;
type CategoryFilter = "all" | TechCategory;

function formatJst(iso: string) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "時刻不明";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

function xStatus(snapshot: TechNewsSnapshot) {
  if (!snapshot.lastXSyncAt) {
    return { label: "初回の取り込み待ち", tone: "bg-amber-100 text-amber-900" };
  }
  const age = Date.now() - Date.parse(snapshot.lastXSyncAt);
  if (Number.isNaN(age) || age > 36 * 60 * 60 * 1000) {
    return { label: "前回から36時間以上", tone: "bg-amber-100 text-amber-900" };
  }
  return { label: "本日分を反映済み", tone: "bg-emerald-100 text-emerald-900" };
}

export function TechDashboard({ initial }: { initial: TechNewsSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [recentOnly, setRecentOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const status = xStatus(snapshot);
  const notionUrl = snapshot.notionUrl || TECH_NEWS_NOTION_URL;

  const articles = useMemo(() => {
    const cutoff = Date.now() - 36 * 60 * 60 * 1000;
    return snapshot.articles.filter((article) => {
      if (category !== "all" && article.category !== category) return false;
      if (source !== "all" && article.sourceKind !== source) return false;
      if (recentOnly && Date.parse(article.publishedAt) < cutoff) return false;
      return true;
    });
  }, [snapshot.articles, category, source, recentOnly]);

  async function reloadFromNotion() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tech/feed");
      const body = (await response.json()) as { ok?: boolean; message?: string; snapshot?: TechNewsSnapshot };
      if (!response.ok || !body.snapshot) {
        setMessage(body.message || "Notion の再読み込みに失敗しました。");
        return;
      }
      setSnapshot(body.snapshot);
      setMessage("Notion のテックニュースを読み直しました。");
    } catch {
      setMessage("Notion の再読み込みに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4efe4] text-stone-900">
      <header className="border-b border-stone-900/10 bg-[#1c1917] text-stone-50">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
          <p className="text-[11px] uppercase tracking-[0.28em] text-orange-200">AI Maneger</p>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="text-stone-300 hover:text-white">
              ダッシュボード
            </Link>
            <Link href="/os" className="text-stone-300 hover:text-white">
              AI会社OS
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-800">1日1回の技術キャッチアップ</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">テックニュース</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-700 md:text-base">
          X のタイムラインは開きません。Grok Bot が毎日 7:17（日本時間）に Notion の「テックニュース」へ保存し、この画面はそのデータベースを読みます。必要なものだけ元記事を開いてください。
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="RSS" value={`${snapshot.mediaCount}件`} note={snapshot.lastMediaSyncAt ? `追加 ${formatJst(snapshot.lastMediaSyncAt)}` : "未収集"} />
          <Stat label="X（Grok Bot）" value={`${snapshot.xCount}件`} note={snapshot.lastXSyncAt ? `追加 ${formatJst(snapshot.lastXSyncAt)}` : "未取得"} />
          <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
            <p className="text-xs text-stone-500">Grok Bot</p>
            <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</p>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <FilterButton active={category === "all"} onClick={() => setCategory("all")}>
            すべて
          </FilterButton>
          {TECH_CATEGORIES.map((key) => (
            <FilterButton key={key} active={category === key} onClick={() => setCategory(key)}>
              {CATEGORY_LABEL[key]}
              <span className="ml-1 text-stone-400">{snapshot.counts[key]}</span>
            </FilterButton>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterButton active={source === "all"} onClick={() => setSource("all")}>
            情報源すべて
          </FilterButton>
          <FilterButton active={source === "media"} onClick={() => setSource("media")}>
            RSS
          </FilterButton>
          <FilterButton active={source === "x"} onClick={() => setSource("x")}>
            X
          </FilterButton>
          <FilterButton active={recentOnly} onClick={() => setRecentOnly((value) => !value)}>
            {recentOnly ? "直近36時間" : "保存分すべて"}
          </FilterButton>
          <button
            type="button"
            onClick={reloadFromNotion}
            disabled={busy}
            className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? "読み込み中…" : "Notionを再読み込み"}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-stone-600">{message}</p> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-3">
            {articles.length === 0 ? (
              <EmptyArticles
                source={source}
                recentOnly={recentOnly}
                blocked={snapshot.mediaErrors.length > 0}
                onShowAll={() => setRecentOnly(false)}
              />
            ) : (
              articles.map((article) => <ArticleCard key={article.id} article={article} />)
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-3xl border border-stone-900/10 bg-white p-5">
              <h2 className="text-lg font-bold">読み取り元</h2>
              <p className="mt-3 text-sm leading-7 text-stone-700">
                Grok Bot が X を読み取り専用で検索し、要約を Notion に保存します。この画面はそこを表示するだけです。
              </p>
              <p className="mt-3 text-xs leading-5 text-stone-500">毎日 7:17（日本時間）。欄が X の行を表示します。RSS の列は用意済みで、収集はまだありません。</p>
              <a href={notionUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-orange-800 underline">
                Notion のテックニュースを開く
              </a>
            </section>
            {snapshot.mediaErrors.length > 0 ? (
              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
                <h2 className="font-bold">Notion を読めません</h2>
                <ul className="mt-2 space-y-1">
                  {snapshot.mediaErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="text-xs text-stone-500">{note}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        active ? "bg-orange-700 text-white" : "border border-stone-900/10 bg-white text-stone-700"
      }`}
    >
      {children}
    </button>
  );
}

function ArticleCard({ article }: { article: TechArticle }) {
  return (
    <article className="rounded-3xl border border-stone-900/10 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-stone-900 px-2 py-0.5 font-semibold text-orange-100">{CATEGORY_LABEL[article.category]}</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
          {article.sourceKind === "x" ? "X" : "RSS"}
        </span>
        <span className="text-stone-500">{article.sourceName}</span>
        <span className="text-stone-400">{formatJst(article.publishedAt)}</span>
      </div>
      <h2 className="mt-3 text-xl font-bold leading-snug">{article.title}</h2>
      <p className="mt-2 text-sm leading-7 text-stone-700">{article.summary}</p>
      <p className="mt-3 text-sm leading-6 text-orange-900">{article.whyItMatters}</p>
      <a href={article.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-orange-800 underline">
        元記事を開く
      </a>
    </article>
  );
}

function EmptyArticles({
  source,
  recentOnly,
  blocked,
  onShowAll,
}: {
  source: SourceFilter;
  recentOnly: boolean;
  blocked: boolean;
  onShowAll: () => void;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-400 bg-white/70 p-6 text-sm leading-7 text-stone-600">
      <p>{blocked ? "Notion から記事を読み取れないため、一覧は空です。" : "この条件の記事はまだありません。"}</p>
      {blocked ? null : source === "x" || source === "all" ? (
        <p className="mt-2">X の欄は、Grok Bot が Notion に保存した行です。まだ無い日は「本日の該当なし」のまま空になります。</p>
      ) : null}
      {blocked ? null : source === "media" ? <p className="mt-2">RSS欄は Notion に列があります。収集はまだ始まっていません。</p> : null}
      {!blocked && recentOnly ? (
        <button type="button" onClick={onShowAll} className="mt-3 font-semibold text-orange-800 underline">
          保存済みも表示する
        </button>
      ) : null}
    </div>
  );
}
