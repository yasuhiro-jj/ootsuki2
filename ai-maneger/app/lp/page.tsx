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
    icon: "📊",
    title: "日次入力 → 週次集計が自動",
    description: "売上・客数・客単価・粗利率・LINE登録数を毎日入力するだけ。週次集計・前週比は自動計算。POSのCSVをそのまま取り込むことも可能です。",
    bg: "bg-violet-50",
    border: "border-violet-200",
    numColor: "text-violet-400",
  },
  {
    number: "02",
    icon: "🔍",
    title: "AI 売上分析エージェント",
    description: "今週の数字を入れると、AIが「事実」と「仮説」を分けて整理し、今すぐ試せる次アクションを優先順に提示します。",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    numColor: "text-emerald-400",
  },
  {
    number: "03",
    icon: "🍽️",
    title: "飲食コンサルタント AI",
    description: "数字・販促・現場運営を横断して診断。現状判断・課題・改善案・最初の一手を構造化カードで返します。",
    bg: "bg-orange-50",
    border: "border-orange-200",
    numColor: "text-orange-400",
  },
  {
    number: "04",
    icon: "💬",
    title: "LINE 配信プランナー AI",
    description: "売上データとメモを読んで、今週のLINE配信文を提案。件名・本文・ターゲット・目的まで下書きを作ります。",
    bg: "bg-green-50",
    border: "border-green-200",
    numColor: "text-green-400",
  },
  {
    number: "05",
    icon: "📝",
    title: "週次レビュー整理 AI",
    description: "振り返りが苦手でも大丈夫。今週のデータとメモから「成果・課題・来週やること」を自動で下書きにします。",
    bg: "bg-sky-50",
    border: "border-sky-200",
    numColor: "text-sky-400",
  },
  {
    number: "06",
    icon: "📌",
    title: "判断メモ・運用指示書",
    description: "Notionに書いたメモや方針がダッシュボードに表示されます。「あのとき何を考えていたか」がいつでも振り返れます。",
    bg: "bg-pink-50",
    border: "border-pink-200",
    numColor: "text-pink-400",
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
    accentBg: "bg-violet-50",
    accentText: "text-violet-700",
    accentBorder: "border-violet-200",
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
    accentBg: "",
    accentText: "",
    accentBorder: "",
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
    accentBg: "bg-orange-50",
    accentText: "text-orange-700",
    accentBorder: "border-orange-200",
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
      <nav className="sticky top-0 z-50 border-b border-white/20 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="bg-gradient-to-r from-violet-600 to-emerald-500 bg-clip-text text-lg font-bold tracking-tight text-transparent">
            AI Maneger
          </span>
          <div className="flex items-center gap-4">
            <a href={`mailto:${CONTACT_EMAIL}`} className="hidden text-sm text-stone-500 hover:text-stone-800 sm:block">
              お問い合わせ
            </a>
            <Link
              href={DEMO_URL}
              className="rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow hover:opacity-90"
            >
              デモを見る
            </Link>
          </div>
        </div>
      </nav>

      {/* ヒーロー */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-500 to-emerald-500 py-28 text-center text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl px-6">
          <p className="inline-block rounded-full border border-white/30 bg-white/20 px-4 py-1 text-xs font-semibold backdrop-blur">
            Notion × AI × 飲食運用
          </p>
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            今週の売上、<br className="sm:hidden" />なぜ下がったか<br />
            すぐ分かりますか？
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-white/80">
            日次データを入れるだけで、AIが売上を分解し、<br />
            課題・仮説・次の一手まで、その日のうちに出てきます。
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={DEMO_URL}
              className="w-full rounded-full bg-white px-8 py-4 text-base font-bold text-violet-700 shadow-lg hover:shadow-xl sm:w-auto"
            >
              無料デモを体験する →
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="w-full rounded-full border border-white/40 px-8 py-4 text-base font-semibold text-white backdrop-blur hover:bg-white/10 sm:w-auto"
            >
              お問い合わせ
            </a>
          </div>
          <p className="mt-4 text-xs text-white/60">クレジットカード不要・申し込みなしでデモを確認できます</p>
        </div>

        {/* 波形区切り */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 60 L0 30 Q360 0 720 30 Q1080 60 1440 30 L1440 60 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* 数字バナー */}
      <section className="py-14">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { num: "6", label: "AI エージェント", color: "text-violet-600" },
              { num: "1", label: "画面で完結", color: "text-emerald-600" },
              { num: "15", label: "分で導入完了", color: "text-orange-500" },
              { num: "毎週", label: "AIが分析・提案", color: "text-sky-500" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-stone-50 px-6 py-6 text-center">
                <p className={`text-4xl font-extrabold ${item.color}`}>{item.num}</p>
                <p className="mt-1 text-sm text-stone-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 課題提起 */}
      <section className="bg-gradient-to-b from-stone-50 to-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
            こんなことで、時間を使っていませんか？
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              { text: "売上はExcel、メモはLINE、レビューはメール…データがバラバラで追えない", color: "border-l-rose-400" },
              { text: "月に1回まとめて振り返るが、「あのとき何があったか」が思い出せない", color: "border-l-orange-400" },
              { text: "AIツールを使いたいが、自分の店のデータで動いてくれるものがない", color: "border-l-amber-400" },
              { text: "コンサルタントに相談したいが、毎回ゼロから説明するのが手間", color: "border-l-red-400" },
            ].map((item) => (
              <div
                key={item.text}
                className={`rounded-2xl border border-stone-100 bg-white px-5 py-5 shadow-sm border-l-4 ${item.color}`}
              >
                <p className="text-sm leading-7 text-stone-700">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 px-8 py-6 text-center text-white">
            <p className="text-lg font-bold">数字は毎日積み上がっているのに、活かせていない。</p>
            <p className="mt-1 text-sm text-white/80">その問題を、AI Maneger は解決します。</p>
          </div>
        </div>
      </section>

      {/* 解決策 */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">
            飲食店の「数字 × AI × 行動」を<br />1画面に集めた運用アプリ
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-stone-500">
            あなたが使い慣れている <strong className="text-stone-800">Notion</strong> をデータの置き場にしながら、
            日次売上の入力から週次レビュー、AIによる分析・提案まで、すべてを1画面から操作できます。
          </p>
          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {[
              { label: "入力", desc: "日次売上・CSV取込", from: "from-violet-500", to: "to-violet-600" },
              { label: "蓄積", desc: "Notionに自動保存", from: "from-indigo-500", to: "to-indigo-600" },
              { label: "AI分析", desc: "週次レポート・提案", from: "from-emerald-500", to: "to-emerald-600" },
            ].map((item, i) => (
              <div key={item.label} className="relative">
                <div className={`rounded-2xl bg-gradient-to-br ${item.from} ${item.to} px-6 py-8 text-white shadow`}>
                  <p className="text-2xl font-bold">{item.label}</p>
                  <p className="mt-1 text-sm text-white/70">{item.desc}</p>
                </div>
                {i < 2 && (
                  <span className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-4 text-xl text-stone-300 sm:block">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 機能 */}
      <section className="bg-gradient-to-b from-stone-50 to-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">機能</h2>
          <p className="mt-2 text-center text-sm text-stone-500">6つのエージェントと機能が、運用を前に進めます</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.number}
                className={`rounded-2xl border ${feature.bg} ${feature.border} px-6 py-6 shadow-sm`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{feature.icon}</span>
                  <p className={`text-xs font-bold tracking-widest ${feature.numColor}`}>{feature.number}</p>
                </div>
                <p className="mt-3 text-base font-semibold text-stone-900">{feature.title}</p>
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
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-8 py-8">
              <p className="text-xl font-bold text-violet-800">🏪 店舗オーナーの方</p>
              <ul className="mt-4 grid gap-3">
                {[
                  "毎日の売上を入力して、週に1回AIのレポートを確認したい",
                  "LINE施策の効果を数字で追いたい",
                  "経営判断の根拠を、感覚ではなくデータで持ちたい",
                ].map((text) => (
                  <li key={text} className="flex items-start gap-2 text-sm leading-7 text-violet-900">
                    <span className="mt-1 text-violet-500">✓</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 px-8 py-8 text-white shadow-lg">
              <p className="text-xl font-bold">🍴 飲食コンサルタントの方</p>
              <ul className="mt-4 grid gap-3">
                {[
                  "複数店舗のクライアントを、1つのシステムで管理したい",
                  "訪問前に数字を確認して、会議の質を上げたい",
                  "AIの提案を叩き台に、自分の提案を効率化したい",
                  "デモ画面をすぐ見せられる状態で持っておきたい",
                ].map((text) => (
                  <li key={text} className="flex items-start gap-2 text-sm leading-7 text-white/90">
                    <span className="mt-1 text-emerald-200">✓</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 導入の流れ */}
      <section className="bg-gradient-to-b from-stone-50 to-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">導入の流れ</h2>
          <p className="mt-2 text-center text-sm text-stone-500">最短15分で使い始められます</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { step: "Step 1", emoji: "📋", title: "Notionを用意する", desc: "既存のNotionワークスペースにDBを作成。テンプレートをコピーするだけです。", color: "from-violet-500 to-violet-600" },
              { step: "Step 2", emoji: "⚙️", title: "接続設定をする", desc: "NotionのAPIキーと各DBのIDを設定。ガイドに沿って進めれば10〜15分で完了します。", color: "from-indigo-500 to-indigo-600" },
              { step: "Step 3", emoji: "🚀", title: "今日から使い始める", desc: "ダッシュボードを開いて今日の売上を入力。翌週から、AIの分析レポートが出始めます。", color: "from-emerald-500 to-emerald-600" },
            ].map((item) => (
              <div key={item.step} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className={`bg-gradient-to-r ${item.color} px-6 py-4`}>
                  <p className="text-xs font-bold text-white/70">{item.step}</p>
                  <p className="mt-1 text-2xl">{item.emoji}</p>
                </div>
                <div className="px-6 py-5">
                  <p className="text-base font-semibold text-stone-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-stone-600">{item.desc}</p>
                </div>
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
                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl scale-105"
                    : "border border-stone-200 bg-white shadow-sm"
                }`}
              >
                {plan.highlight && (
                  <p className="mb-3 inline-block rounded-full bg-yellow-400 px-3 py-0.5 text-xs font-bold text-yellow-900">
                    ⭐ おすすめ
                  </p>
                )}
                <p className={`text-lg font-bold ${plan.highlight ? "text-white" : "text-stone-900"}`}>
                  {plan.name}
                </p>
                <p className={`mt-1 text-sm ${plan.highlight ? "text-white/70" : "text-stone-500"}`}>
                  {plan.description}
                </p>
                <p className={`mt-4 text-3xl font-extrabold ${plan.highlight ? "text-white" : "text-stone-900"}`}>
                  {plan.price}
                  <span className={`text-base font-normal ${plan.highlight ? "text-white/60" : "text-stone-400"}`}>
                    {plan.unit}
                  </span>
                </p>
                <ul className="mt-6 grid gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm leading-6 ${plan.highlight ? "text-white/80" : "text-stone-600"}`}>
                      <span className={plan.highlight ? "text-yellow-300" : "text-emerald-500"}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.cta === "お問い合わせ" ? `mailto:${CONTACT_EMAIL}` : DEMO_URL}
                  className={`mt-8 block rounded-full py-3 text-center text-sm font-bold transition ${
                    plan.highlight
                      ? "bg-white text-violet-700 hover:bg-violet-50 shadow"
                      : "bg-gradient-to-r from-violet-600 to-emerald-500 text-white hover:opacity-90"
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
      <section className="bg-gradient-to-br from-indigo-50 to-emerald-50 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-4xl">🎮</p>
          <h2 className="mt-4 text-2xl font-bold text-stone-900 sm:text-3xl">まずデモを体験してください</h2>
          <p className="mt-4 text-base leading-8 text-stone-600">
            架空データで動くデモ環境を用意しています。<br />
            実際の画面・AI分析・操作感を、申し込みなしで今すぐ確認できます。
          </p>
          <div className="mt-8 inline-block rounded-2xl border border-indigo-200 bg-white px-8 py-6 text-left text-sm shadow-sm">
            <p className="font-semibold text-stone-900">デモアクセス情報</p>
            <div className="mt-3 grid gap-1 text-stone-600">
              <p>ユーザーID: <span className="font-mono font-bold text-violet-700">demo-viewer</span></p>
              <p>パスワード: <span className="text-stone-400">お問い合わせください（1営業日以内にご返信）</span></p>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={DEMO_URL}
              className="w-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 px-8 py-4 text-base font-bold text-white shadow-lg hover:opacity-90 sm:w-auto"
            >
              デモ画面を開く →
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="w-full rounded-full border border-stone-300 bg-white px-8 py-4 text-base font-semibold text-stone-700 hover:bg-stone-50 sm:w-auto"
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
            {faqs.map((faq, i) => (
              <div key={faq.q} className="rounded-2xl border border-stone-100 bg-stone-50 px-6 py-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">
                    Q
                  </span>
                  <p className="font-semibold text-stone-900">{faq.q}</p>
                </div>
                <div className="mt-3 flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">
                    A
                  </span>
                  <p className="text-sm leading-7 text-stone-600">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* クロージング CTA */}
      <section className="bg-gradient-to-br from-violet-600 via-indigo-600 to-emerald-500 py-28">
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            毎週の数字を、<br />毎週の行動に変える。
          </h2>
          <p className="mt-4 text-base leading-8 text-white/70">
            売上が上がった理由も、下がった理由も、今週中に分かる。<br />
            次に何をすべきか、AIが整理してくれる。
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={DEMO_URL}
              className="w-full rounded-full bg-white px-8 py-4 text-base font-bold text-violet-700 shadow-xl hover:shadow-2xl sm:w-auto"
            >
              無料デモを体験する →
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="w-full rounded-full border border-white/40 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 sm:w-auto"
            >
              お問い合わせ
            </a>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t border-stone-100 bg-white py-10">
        <div className="mx-auto max-w-5xl px-6 text-center text-xs text-stone-400">
          <p className="bg-gradient-to-r from-violet-600 to-emerald-500 bg-clip-text text-sm font-bold text-transparent">
            AI Maneger
          </p>
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
