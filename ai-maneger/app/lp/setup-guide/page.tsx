import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Notion 接続設定ガイド｜AI Maneger",
  description:
    "Notion の APIキー・各種データベースIDの準備から .env.local への反映まで。ガイドに沿えばおよそ10〜15分での完了を目安にできます。",
};

const envKeys = [
  { key: "NOTION_API_KEY", note: "`NOTION_API_TOKEN` を代わりに置いても動作します（どちらか必須）。" },
  { key: "NOTION_PROJECT_DB_ID", note: "プロジェクト一覧の「プロジェクトDB」" },
  { key: "NOTION_OOTSUKI_PROJECT_PAGE_ID", note: "店舗／プロジェクトのハブページ" },
  { key: "NOTION_OOTSUKI_DAILY_SALES_DB_ID", note: "日次売上DB" },
  { key: "NOTION_OOTSUKI_KPI_DB_ID", note: "KPI DB" },
  { key: "NOTION_OOTSUKI_MEMO_DB_ID", note: "メモ／判断メモDB" },
  { key: "NOTION_OOTSUKI_LINE_REPORT_PAGE_ID", note: "LINEレポート用ページ" },
  { key: "NOTION_OOTSUKI_PRODUCT_COST_DB_ID", note: "原価・商品コストDB" },
  { key: "NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID", note: "週次アクションDB" },
  { key: "NOTION_OOTSUKI_INSTRUCTIONS_PAGE_ID", note: "任意・運用指示書ページ" },
] as const;

export default function SetupGuidePage() {
  return (
    <div className="min-h-screen bg-white font-sans text-stone-900 [-webkit-tap-highlight-color:transparent]">
      <header className="sticky top-0 z-10 border-b border-stone-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/lp"
            className="touch-manipulation text-sm font-medium text-violet-600 hover:text-violet-800"
          >
            ← LP に戻る
          </Link>
          <span className="text-xs font-semibold text-stone-400">設定ガイド</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        <h1 className="text-balance text-2xl font-bold leading-snug text-stone-900 sm:text-3xl">
          Notion 接続設定ガイド
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600 sm:text-base sm:leading-7">
          Notion の<strong className="text-stone-800">APIキー（シークレット）</strong>と、AI
          Maneger が参照する<strong className="text-stone-800">各データベース・ページのID</strong>
          を用意し、環境変数に反映するまでの流れです。初めての方でも、
          <strong className="text-stone-800">この手順に沿って進めればおよそ10〜15分</strong>
          程度での完了を目安にできます（ワークスペースの権限やDB数によって前後します）。
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-bold text-stone-900 sm:text-xl">1. 事前に確認すること</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-stone-600 sm:leading-7">
            <li>Notion の対象ワークスペースで、ページとデータベースを開けること。</li>
            <li>
              接続情報（APIキーや `.env.local`）は<strong>第三者に共有しない</strong>でください。Git
              にコミットしないよう注意します。
            </li>
            <li>伴走プランでは、ここから先も一緒に確認できます。まずは全体像の把握用に読んでください。</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold text-stone-900 sm:text-xl">2. Notion でインテグレーションを作る</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-4 text-sm leading-relaxed text-stone-600 sm:pl-5 sm:leading-7">
            <li>
              Notion の{" "}
              <a
                href="https://www.notion.so/my-integrations"
                className="font-medium text-violet-600 underline-offset-2 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                My integrations
              </a>{" "}
              を開きます。
            </li>
            <li>「新しいインテグレーションを作成」で名前を付け、関連ワークスペースを選びます。</li>
            <li>
              作成後に表示される<strong className="text-stone-800">「内部インテグレーションシークレット」</strong>
              をコピーします。これがアプリ側でいう「APIキー」に相当し、環境変数{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs text-stone-800">NOTION_API_KEY</code>{" "}
              （または <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">NOTION_API_TOKEN</code>
              ）に貼り付けます。
            </li>
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold text-stone-900 sm:text-xl">3. DB・ページにインテグレーションを接続する</h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-600 sm:leading-7">
            APIキーだけでは読めません。<strong className="text-stone-800">各データベース（および必要な親ページ）</strong>
            で、インテグレーションを<strong>「コネクト」または共有メンバーとして追加</strong>し、アクセス権を付与します。
          </p>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-stone-600 sm:leading-7">
            <li>データベース画面右上の「…」→ コネクト → 作成したインテグレーションを選択、が一般的です。</li>
            <li>親がページのみで、その下にデータベースがある場合は、親ページ側にも権限が届くようにします。</li>
            <li>
              「ページID」タイプの環境変数は、ページ URL の識別子を使います（次項）。
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold text-stone-900 sm:text-xl">4. データベース／ページ ID の取り方</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-4 text-sm leading-relaxed text-stone-600 sm:pl-5 sm:leading-7">
            <li>対象のデータベース（またはページ）をブラウザで開きます。</li>
            <li>
              アドレスバーの URL に含まれる、<strong className="text-stone-800">32桁の文字列</strong>
              （ハイフン付きの場合はそれを含めた末尾のID部分）がページ／DBのIDです。例:{" "}
              <span className="break-all font-mono text-xs text-stone-500">
                notion.so/workspace/
                <strong className="text-stone-800">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</strong>
              </span>
            </li>
            <li>
              アプリ側の環境変数には、README・<code className="rounded bg-stone-100 px-1 py-0.5 text-xs">.env.local.example</code>{" "}
              に名前が並んでいるとおりに、ひとつずつ対応させて貼り付けます。テンプレDBを複製した場合も、{" "}
              <strong className="text-stone-800">複製後の実際のURLから取り直したID</strong>を使います。
            </li>
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold text-stone-900 sm:text-xl">5. `.env.local` に書き込む（ローカル）</h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-600 sm:leading-7">
            プロジェクトルートの{" "}
            <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">.env.local.example</code> を{" "}
            <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">.env.local</code>{" "}
            にコピーし、次のキーをそれぞれ埋めます。値の前後に余計な空白や引用符が入らないようにします。
          </p>
          <dl className="mt-4 space-y-4 rounded-2xl border border-stone-100 bg-stone-50 px-4 py-4 sm:px-5">
            {envKeys.map((row) => (
              <div key={row.key}>
                <dt className="font-mono text-xs font-semibold text-violet-800 sm:text-sm">{row.key}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-stone-600 sm:text-sm">{row.note}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-stone-600 sm:leading-7">
            開発サーバーを再起動してからログイン・ダッシュボードを確認します。項目名がテンプレと違う既存DBに寄せている場合は、伴走でのマッピング確認が必要です。
          </p>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:px-5">
          <h2 className="text-lg font-bold text-amber-900 sm:text-xl">うまくいかないとき</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-amber-900/90">
            <li>
              「Unauthorized」や取得件数が0のときは、<strong>インテグレーションのコネクト漏れ</strong>がよくあります。
            </li>
            <li>ID は URL から取り直し、環境変数のタイプミス（別DBを指している）を疑います。</li>
            <li>
              README の「環境変数」節や、プロジェクトの <code className="rounded bg-amber-100/80 px-1 text-xs">scripts/validate-notion-env.mjs</code>{" "}
              なども参考にしてください。
            </li>
          </ul>
        </section>

        <footer className="mt-12 border-t border-stone-100 pt-8 text-center">
          <Link
            href="/lp"
            className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow hover:opacity-90 active:opacity-90"
          >
            ランディングへ戻る
          </Link>
        </footer>
      </main>
    </div>
  );
}
