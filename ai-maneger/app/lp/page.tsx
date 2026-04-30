import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Maneger｜飲食店の数字と判断を、1画面で回す運用アシスタント",
  description:
    "日次データを入れるだけで、AIが売上を分解し、課題・仮説・次の一手まで出てきます。Notion × AI × 飲食運用。",
};

const DEMO_URL = "/login?tenant=demo";
const CONTACT_EMAIL = "yasuhiro.watanabe1@gmail.com";

const features = [
  {
    number: "01",
    title: "日次入力 → 週次集計が自動",
    description:
      "売上・客数・客単価・粗利率・LINE登録数を毎日入力するだけ。週次集計・前週比は自動計算。POSのCSVをそのまま取り込むことも可能です。",
    color: "bg-stone-50 border-stone-200",
  },
  {
    number: "02",
    title: "AI 売上分析エージェント",
    description:
      "今週の数字を入れると、AIが「事実」と「仮説」を分けて整理し、今すぐ試せる次アクションを優先順に提示します。",
    color: "bg-emerald-50 border-emerald-200",
  },
  {
    number: "03",
    title: "飲食コンサルタント AI",
    description:
      "数字・販促・現場運営を横断して診断。現状判断・課題・改善案・最初の一手を構造化カードで返します。",
    color: "bg-blue-50 border-blue-200",
  },
  {
    number: "04",
    title: "LINE 配信プランナー AI",
    description:
      "売上データとメモを読んで、今週のLINE配信文を提案。件名・本文・ターゲット・目的まで下書きを作ります。",
    color: "bg-green-50 border-green-200",
  },
  {
    number: "05",
    title: "週次レビュー整理 AI",
    description:
      "振り返りが苦手でも大丈夫。今週のデータとメモから「成果・課題・来週やること」を自動で下書きにします。",
    color: "bg-amber-50 border-amber-200",
  },
  {
    number: "06",
    title: "判断メモ・運用指示書",
    description:
      "Notionに書いたメモや方針がダッシュボードに表示されます。「あのとき何を考えていたか」がいつでも振り返れます。",
    color: "bg-stone-50 border-stone-200",
  },
];

const plans = [
  {
    name: "スタンダード",
    price: "¥9,800",
    unit: "/ 月",
    description: "1店舗の日常運用に最適",
    features: [
      "ダッシュボード（1テナント）",
      "日次入力・週次集計",
      "AI 分析エージェント全種",
      "CSV 取込",
      "Notion 連携",
      "メールサポート",
    ],
    cta: "デモを見る",
    highlight: false,
  },
  {
    name: "プロ",
    price: "¥29,800",
    unit: "/ 月",
    description: "複数店舗・コンサルタント向け",
    features: [
      "ダッシュボード（最大5テナント）",
      "スタンダードの全機能",
      "マルチテナント権限管理",
      "監査ログ（検索・CSV出力）",
      "デモ環境（商談用）",
      "優先メールサポート",
    ],
    cta: "デモを見る",
    highlight: true,
  },
  {
    name: "エンタープライズ",
    price: "要相談",
    unit: "",
    description: "FC・複数拠点・カスタム要件",
    features: [
      "テナント数無制限",
      "プロの全機能",
      "専用 Notion スキーマ設計",
      "POS 連携カスタマイズ",
      "導入サポート込み",
      "専任担当者",
    ],
    cta: "お問い合わせ",
    highlight: false,
  },
];

const faqs = [
  {
    q: "Notionを使ったことがないのですが大丈夫ですか？",
    a: "無料プランで使えます。必要なDBのテンプレートをご提供しますので、コピーして接続するだけです。",
  },
  {
    q: "POSのデータはそのまま取り込めますか？",
    a: "CSVエクスポートができるPOSであれば対応しています。列名が違っても設定で吸収できます。",
  },
  {
    q: "複数店舗で使えますか？",
    a: "プロプラン以上で対応しています。店舗ごとにデータを完全に分離して管理できます。",
  },
  {
    q: "セキュリティは大丈夫ですか？",
    a: "ユーザー認証・ロール別認可・操作の監査ログを実装しています。店舗ごとにデータが混ざる構造ではありません。",
  },
  {
    q: "AIの回答はどこから来ていますか？",
    a: "OpenAI（GPT-4o-mini）を使用しています。あなたのNotionのデータだけを参照します。他の店舗のデータは一切参照しません。",
  },
  {
    q: "まずデモだけ見ることはできますか？",
    a: "できます。架空データで動くデモ環境を用意しています。申し込み前に操作感を確認してください。",
  },
];

export default function LpPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-stone-900">

      {/* ナビゲーション */}
      <nav className="sticky top-0 z-50 border-b border-stone-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight text-stone-900">AI Maneger</span>
          <div className="flex items-center gap-4">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hidden text-sm text-stone-600 hover:text-stone-900 sm:block"
            >
              お問い合わせ
            </a>
            <Link
              href={DEMO_URL}
              className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              デモを見る
            </Link>
          </div>
        </div>
      </nav>

      {/* ヒーロー */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <p className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-xs font-medium text-emerald-700">
          Notion × AI × 飲食運用
        </p>
        <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-stone-900 sm:text-5xl">
          今週の売上、<br className="sm:hidden" />
          なぜ下がったか<br />
          すぐ分かりますか？
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-stone-600">
          日次データを入れるだけで、AIが売上を分解し、<br />
          課題・仮説・次の一手まで、その日のうちに出てきます。
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href={DEMO_URL}
            className="w-full rounded-full bg-stone-900 px-8 py-4 text-base font-semibold text-white hover:bg-stone-700 sm:w-auto"
          >
            無料デモを体験する
          </Link>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="w-full rounded-full border border-stone-300 px-8 py-4 text-base font-semibold text-stone-700 hover:bg-stone-50 sm:w-auto"
          >
            お問い合わせ
          </a>
        </div>
        <p className="mt-4 text-xs text-stone-400">クレジットカード不要・申し込みなしでデモを確認できます</p>
      </section>

      {/* 課題提起 */}
      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
            こんなことで、時間を使っていませんか？
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              "売上はExcel、メモはLINE、レビューはメール…データがバラバラで追えない",
              "月に1回まとめて振り返るが、「あのとき何があったか」が思い出せない",
              "AIツールを使いたいが、自分の店のデータで動いてくれるものがない",
              "コンサルタントに相談したいが、毎回ゼロから説明するのが手間",
            ].map((text) => (
              <div
                key={text}
                className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-5"
              >
                <span className="mt-0.5 text-rose-400">✕</span>
                <p className="text-sm leading-7 text-stone-700">{text}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-base font-semibold text-stone-900">
            数字は毎日積み上がっているのに、活かせていない。<br />
            その問題を、AI Maneger は解決します。
          </p>
        </div>
      </section>

      {/* 解決策 */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">
            飲食店の「数字 × AI × 行動」を<br />1画面に集めた運用アプリ
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-stone-600">
            あなたが使い慣れている <strong>Notion</strong> をデータの置き場にしながら、
            日次売上の入力から週次レビュー、AIによる分析・提案まで、
            すべてを <code className="rounded bg-stone-100 px-1 text-sm">/dashboard</code> の1画面から操作できます。
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { label: "入力", desc: "日次売上・CSV取込" },
              { label: "蓄積", desc: "Notionに自動保存" },
              { label: "AI分析", desc: "週次レポート・提案" },
            ].map((item, i) => (
              <div key={item.label} className="relative rounded-2xl bg-stone-50 px-6 py-6">
                {i < 2 && (
                  <span className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-1/2 text-stone-400 sm:block">
                    →
                  </span>
                )}
                <p className="text-2xl font-bold text-stone-900">{item.label}</p>
                <p className="mt-1 text-sm text-stone-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 機能 */}
      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">機能</h2>
          <p className="mt-2 text-center text-sm text-stone-500">6つのエージェントと機能が、運用を前に進めます</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.number}
                className={`rounded-2xl border px-6 py-6 ${feature.color}`}
              >
                <p className="text-xs font-bold tracking-widest text-stone-400">{feature.number}</p>
                <p className="mt-2 text-base font-semibold text-stone-900">{feature.title}</p>
                <p className="mt-2 text-sm leading-7 text-stone-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ターゲット */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">こんな方に向いています</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 px-8 py-8">
              <p className="text-lg font-bold text-stone-900">店舗オーナーの方</p>
              <ul className="mt-4 grid gap-3">
                {[
                  "毎日の売上を入力して、週に1回AIのレポートを確認したい",
                  "LINE施策の効果を数字で追いたい",
                  "経営判断の根拠を、感覚ではなくデータで持ちたい",
                ].map((text) => (
                  <li key={text} className="flex items-start gap-2 text-sm leading-7 text-stone-700">
                    <span className="mt-1 text-emerald-500">✓</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-stone-900 bg-stone-900 px-8 py-8">
              <p className="text-lg font-bold text-white">飲食コンサルタントの方</p>
              <ul className="mt-4 grid gap-3">
                {[
                  "複数店舗のクライアントを、1つのシステムで管理したい",
                  "訪問前に数字を確認して、会議の質を上げたい",
                  "AIの提案を叩き台に、自分の提案を効率化したい",
                  "デモ画面をすぐ見せられる状態で持っておきたい",
                ].map((text) => (
                  <li key={text} className="flex items-start gap-2 text-sm leading-7 text-stone-300">
                    <span className="mt-1 text-emerald-400">✓</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 導入の流れ */}
      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">導入の流れ</h2>
          <p className="mt-2 text-center text-sm text-stone-500">最短15分で使い始められます</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "Step 1",
                title: "Notionを用意する",
                desc: "既存のNotionワークスペースに指定のDBを作成。テンプレートをコピーするだけです。",
              },
              {
                step: "Step 2",
                title: "接続設定をする",
                desc: "NotionのAPIキーと各DBのIDを設定。設定ガイドに沿って進めれば10〜15分で完了します。",
              },
              {
                step: "Step 3",
                title: "今日から使い始める",
                desc: "ダッシュボードを開いて今日の売上を入力。翌週から、AIの分析レポートが出始めます。",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl bg-white px-6 py-6 shadow-sm">
                <p className="text-xs font-bold tracking-widest text-emerald-600">{item.step}</p>
                <p className="mt-2 text-base font-semibold text-stone-900">{item.title}</p>
                <p className="mt-2 text-sm leading-7 text-stone-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 料金 */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">料金プラン</h2>
          <p className="mt-2 text-center text-sm text-stone-500">すべてのプランにデモ環境が含まれます</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl px-7 py-8 ${
                  plan.highlight
                    ? "bg-stone-900 text-white"
                    : "border border-stone-200 bg-white"
                }`}
              >
                {plan.highlight && (
                  <p className="mb-3 inline-block rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-bold text-white">
                    おすすめ
                  </p>
                )}
                <p className={`text-lg font-bold ${plan.highlight ? "text-white" : "text-stone-900"}`}>
                  {plan.name}
                </p>
                <p className={`mt-1 text-sm ${plan.highlight ? "text-stone-300" : "text-stone-500"}`}>
                  {plan.description}
                </p>
                <p className={`mt-4 text-3xl font-bold ${plan.highlight ? "text-white" : "text-stone-900"}`}>
                  {plan.price}
                  <span className={`text-base font-normal ${plan.highlight ? "text-stone-300" : "text-stone-500"}`}>
                    {plan.unit}
                  </span>
                </p>
                <ul className="mt-6 grid gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm leading-6 ${plan.highlight ? "text-stone-300" : "text-stone-600"}`}>
                      <span className={`mt-0.5 ${plan.highlight ? "text-emerald-400" : "text-emerald-500"}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.cta === "お問い合わせ" ? `mailto:${CONTACT_EMAIL}` : DEMO_URL}
                  className={`mt-8 block rounded-full py-3 text-center text-sm font-semibold transition ${
                    plan.highlight
                      ? "bg-white text-stone-900 hover:bg-stone-100"
                      : "border border-stone-300 text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* デモ */}
      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">まずデモを体験してください</h2>
          <p className="mt-4 text-base leading-8 text-stone-600">
            架空データで動くデモ環境を用意しています。<br />
            実際の画面・AI分析・操作感を、申し込みなしで今すぐ確認できます。
          </p>
          <div className="mt-8 inline-block rounded-2xl border border-stone-200 bg-white px-8 py-6 text-left text-sm">
            <p className="font-semibold text-stone-900">デモアクセス情報</p>
            <div className="mt-3 grid gap-1 text-stone-600">
              <p>ユーザーID: <span className="font-mono text-stone-900">demo-viewer</span></p>
              <p>パスワード: <span className="text-stone-500">お問い合わせください（1営業日以内にご返信）</span></p>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={DEMO_URL}
              className="w-full rounded-full bg-stone-900 px-8 py-4 text-base font-semibold text-white hover:bg-stone-700 sm:w-auto"
            >
              デモ画面を開く
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="w-full rounded-full border border-stone-300 px-8 py-4 text-base font-semibold text-stone-700 hover:bg-stone-100 sm:w-auto"
            >
              パスワードを受け取る
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">よくある質問</h2>
          <div className="mt-10 grid gap-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-stone-200 px-6 py-5">
                <p className="font-semibold text-stone-900">Q. {faq.q}</p>
                <p className="mt-2 text-sm leading-7 text-stone-600">A. {faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* クロージング CTA */}
      <section className="bg-stone-900 py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            毎週の数字を、毎週の行動に変える。
          </h2>
          <p className="mt-4 text-base leading-8 text-stone-400">
            売上が上がった理由も、下がった理由も、今週中に分かる。<br />
            次に何をすべきか、AIが整理してくれる。
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={DEMO_URL}
              className="w-full rounded-full bg-white px-8 py-4 text-base font-semibold text-stone-900 hover:bg-stone-100 sm:w-auto"
            >
              無料デモを体験する
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="w-full rounded-full border border-stone-600 px-8 py-4 text-base font-semibold text-stone-300 hover:border-stone-400 sm:w-auto"
            >
              お問い合わせ
            </a>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t border-stone-200 py-10">
        <div className="mx-auto max-w-5xl px-6 text-center text-xs text-stone-400">
          <p className="font-semibold text-stone-900">AI Maneger</p>
          <p className="mt-1">Notion × AI × 飲食運用</p>
          <p className="mt-3">
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-stone-700">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </footer>

    </div>
  );
}
