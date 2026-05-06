import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Maneger｜伴走型導入支援＋サポートサブスク｜飲食店の数字とAI運用",
  description:
    "NotionとDBの合わせ込みは一緒に。初期の接続検証から運用定着まで伴走し、サブスクで継続サポート。飲食店向けAIダッシュボード。",
};

const DEMO_URL = "/login?tenant=demo";
const CONTACT_EMAIL = "yasuhiro.watanabe1@gmail.com";

const features = [
  {
    number: "00",
    icon: "🤝",
    title: "伴走型・導入支援",
    description: "NotionのDB設計・ID取得・接続確認まで一緒に進めます。新規クライアントでも「設定で止まる」時間を減らし、運用に集中できる状態へ。",
    bg: "bg-amber-50",
    border: "border-amber-200",
    numColor: "text-amber-600",
  },
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
    name: "伴走ライト",
    price: "要相談",
    unit: "",
    description: "小規模1店舗・はじめての方",
    features: [
      "初期：Kickoff〜接続検証まで伴走",
      "Notion DBのすり合わせ・テンプレ複製支援",
      "サブスク：チャット中心の運用フォロー（枠は契約により）",
      "ダッシュボード・AIエージェント利用",
      "軽微な設定見直しの相談",
    ],
    cta: "無料相談",
    highlight: false,
    accentBg: "bg-violet-50",
    accentText: "text-violet-700",
    accentBorder: "border-violet-200",
  },
  {
    name: "伴走スタンダード",
    price: "要相談",
    unit: "",
    description: "本格運用・定例フォロー付き",
    features: [
      "伴走ライトの内容一式",
      "月次ミーティング枠（回数は契約により）",
      "CSV列・権限・トラブル切り分けを厚めに",
      "マルチテナント・権限設計の整理（範囲内）",
      "リリース時の影響説明と設定フォロー",
    ],
    cta: "無料相談",
    highlight: true,
    accentBg: "",
    accentText: "",
    accentBorder: "",
  },
  {
    name: "コンサル・複数店",
    price: "要相談",
    unit: "",
    description: "支援事業者・複数店舗・カスタム",
    features: [
      "クライアントごとの初期セットアップ伴走",
      "デモ→本番移行の再現パッケージ",
      "監査ログ・テナント設計を含む整理",
      "POS/CSV要件の個別調整（範囲により）",
      "専任窓口・ SLA は要相談",
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
    q: "自分でNotionのDBを全部合わせる必要がありますか？",
    a: "必須ではありません。伴走プランではテンプレ複製や既存DBとのすり合わせを一緒に進めます。メンテに必要な知識だけ、簡潔にお渡しします。",
  },
  {
    q: "SaaSだけ契約して自走はできますか？",
    a: "技術的には可能ですが、新規では設定負荷が高くなりやすいため、当サービスは「導入支援＋サブスク」を推奨する設計です。個別ご相談ください。",
  },
  {
    q: "POSのデータはそのまま取り込めますか？",
    a: "CSVエクスポートができれば対応余地があります。列名・文字コードの差は、伴走時に確認して吸収方針を決めます。",
  },
  {
    q: "複数店舗で使えますか？",
    a: "可能です。テナント設計・権限は規模に応じて一緒に整理します（コンサル・複数店プランが向きます）。",
  },
  {
    q: "セキュリティは大丈夫ですか？",
    a: "ユーザー認証・ロール別認可・監査ログを備えています。契約時に範囲を説明します。",
  },
  {
    q: "AIの回答はどこから来ていますか？",
    a: "OpenAI（GPT-4o-mini）等を利用し、あなたの店のコンテキストに沿って回答します。他店データを混ぜる設計にはしていません。",
  },
  {
    q: "まずデモだけ見ることはできますか？",
    a: "できます。デモは操作感の確認用です。本番のDB合わせ込みは伴走で別途進めます。",
  },
];

export default function LpPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-stone-900 [-webkit-tap-highlight-color:transparent]">

      {/* ナビゲーション */}
      <nav className="sticky top-0 z-50 border-b border-stone-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <span className="bg-gradient-to-r from-violet-600 to-emerald-500 bg-clip-text text-base font-bold tracking-tight text-transparent sm:text-lg">
            AI Maneger
          </span>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="touch-manipulation rounded-full border border-stone-200 px-3 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50 sm:hidden"
            >
              相談
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hidden text-sm text-stone-500 hover:text-stone-800 sm:inline"
            >
              無料相談・お問い合わせ
            </a>
            <Link
              href={DEMO_URL}
              className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 active:opacity-90 sm:min-h-0 sm:px-5 sm:py-2"
            >
              デモ
            </Link>
          </div>
        </div>
      </nav>

      {/* ヒーロー */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-500 to-emerald-500 pb-24 pt-16 text-center text-white sm:pb-28 sm:pt-24 md:pt-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl px-4 text-balance sm:px-6">
          <p className="inline-block rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur sm:text-xs">
            伴走型導入支援 ＋ サポートサブスク
          </p>
          <h1 className="mt-5 text-[1.65rem] font-bold leading-snug tracking-tight sm:text-5xl sm:leading-tight">
            DBの準備で止まらない、
            <br className="sm:hidden" />
            <span className="sm:inline"> </span>
            <span className="text-yellow-300">伴走型</span>の飲食AI運用
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-lg sm:leading-8">
            NotionやDB・接続設定は、ひとりで抱え込まない。
            <span className="hidden sm:inline">
              <br />
            </span>
            <span className="sm:hidden"> </span>
            初期から<strong className="text-white">一緒に合わせ込み</strong>し、運用フェーズも
            <strong className="text-white">サブスクでフォロー</strong>します。
          </p>
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="touch-manipulation flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3.5 text-base font-bold text-violet-700 shadow-lg active:opacity-90 sm:inline-flex sm:min-h-0 sm:w-auto sm:px-8 sm:py-4"
            >
              無料相談（15〜30分）→
            </a>
            <Link
              href={DEMO_URL}
              className="touch-manipulation flex min-h-12 items-center justify-center rounded-full border border-white/40 px-6 py-3.5 text-base font-semibold text-white backdrop-blur active:bg-white/15 sm:inline-flex sm:min-h-0 sm:w-auto sm:px-8 sm:py-4"
            >
              操作デモを見る
            </Link>
          </div>
          <p className="mt-4 px-1 text-[11px] leading-relaxed text-white/65 sm:text-xs">
            デモは操作感の確認用です。本番のDB合わせ込みは伴走プランで対応します
          </p>
        </div>

        {/* 波形区切り */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 60 L0 30 Q360 0 720 30 Q1080 60 1440 30 L1440 60 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* 数字バナー */}
      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {[
              { num: "6+", label: "AI エージェント", color: "text-violet-600" },
              { num: "1", label: "画面で完結", color: "text-emerald-600" },
              { num: "伴走", label: "接続まで支援", color: "text-orange-500" },
              { num: "継続", label: "サブスクフォロー", color: "text-sky-500" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-stone-50 px-3 py-4 text-center sm:px-6 sm:py-6">
                <p className={`text-2xl font-extrabold sm:text-4xl ${item.color}`}>{item.num}</p>
                <p className="mt-1 text-xs text-stone-500 sm:text-sm">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 課題提起 */}
      <section className="bg-gradient-to-b from-stone-50 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-balance text-center text-xl font-bold text-stone-900 sm:text-3xl">
            こんなことで、時間を使っていませんか？
          </h2>
          <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
            {[
              { text: "売上はExcel、メモはLINE…データがバラバラで、どこから揃えるか分からない", color: "border-l-rose-400" },
              { text: "Notionは触れたが、アプリ側とDB名・型・IDを自分で一致させるのが不安", color: "border-l-orange-400" },
              { text: "ツールだけ買っても環境構築に時間が溶け、「まだ運用できていない」", color: "border-l-amber-400" },
              { text: "AIで分析したいが、入力とDBが整わないままになりがちと分かっている", color: "border-l-red-400" },
              {
                text: "飲食コンサルタントに色々聞きたいが、コンサルを雇う余裕がない。またなんとなく気が引ける",
                color: "border-l-violet-400",
              },
            ].map((item) => (
              <div
                key={item.text}
                className={`rounded-2xl border border-stone-100 bg-white px-5 py-5 shadow-sm border-l-4 ${item.color}`}
              >
                <p className="text-sm leading-relaxed text-stone-700 sm:leading-7">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 px-5 py-5 text-center text-white sm:mt-10 sm:px-8 sm:py-6">
            <p className="text-base font-bold leading-snug sm:text-lg">「契約した」のに、設定で止まっていませんか。</p>
            <p className="mt-1 text-sm text-white/80">導入から定着まで、AI Maneger は伴走で支えます。</p>
          </div>
        </div>
      </section>

      {/* 解決策 */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
          <h2 className="text-balance text-xl font-bold text-stone-900 sm:text-3xl">
            アプリ ＋ <span className="text-violet-600">伴走で「合わせ込み」</span>
            <br />
            ＋ サブスクで運用フォロー
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-left text-[15px] leading-relaxed text-stone-500 sm:text-center sm:text-base sm:leading-8">
            <strong className="text-stone-800">Notion</strong>を正本にしつつ、DB・権限・接続のすり合わせは<strong className="text-stone-800">一緒に検証</strong>。
            日次入力・週次集計・AI分析は1画面。難しいところは<strong className="text-stone-800">導入支援と継続サポート</strong>でカバーします。
          </p>
          <div className="mx-auto mt-10 grid max-w-md gap-2 sm:max-w-none sm:grid-cols-3 sm:gap-3">
            {[
              { label: "入力", desc: "日次売上・CSV取込", from: "from-violet-500", to: "to-violet-600" },
              { label: "蓄積", desc: "Notionに自動保存", from: "from-indigo-500", to: "to-indigo-600" },
              { label: "AI分析", desc: "週次レポート・提案", from: "from-emerald-500", to: "to-emerald-600" },
            ].map((item, i) => (
              <div key={item.label}>
                <div className="relative">
                  <div className={`rounded-2xl bg-gradient-to-br ${item.from} ${item.to} px-5 py-6 text-white shadow sm:px-6 sm:py-8`}>
                    <p className="text-xl font-bold sm:text-2xl">{item.label}</p>
                    <p className="mt-1 text-xs text-white/75 sm:text-sm">{item.desc}</p>
                  </div>
                  {i < 2 && (
                    <span className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-4 text-xl text-stone-300 sm:block">
                      →
                    </span>
                  )}
                </div>
                {i < 2 && (
                  <div className="flex justify-center py-1 text-lg text-stone-300 sm:hidden" aria-hidden>
                    ↓
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 機能 */}
      <section className="bg-gradient-to-b from-stone-50 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-balance text-center text-xl font-bold text-stone-900 sm:text-3xl">機能</h2>
          <p className="mt-2 px-1 text-center text-xs text-stone-500 sm:text-sm">
            伴走で土台を整えたうえで、7つの柱が運用を前に進めます
          </p>
          <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.number}
                className={`rounded-2xl border ${feature.bg} ${feature.border} px-5 py-5 shadow-sm sm:px-6 sm:py-6`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{feature.icon}</span>
                  <p className={`text-xs font-bold tracking-widest ${feature.numColor}`}>{feature.number}</p>
                </div>
                <p className="mt-3 text-base font-semibold text-stone-900">{feature.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-stone-600 sm:leading-7">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ターゲット */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-balance text-center text-xl font-bold text-stone-900 sm:text-3xl">
            こんな方に向いています
          </h2>
          <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-6 sm:px-8 sm:py-8">
              <p className="text-lg font-bold text-violet-800 sm:text-xl">🏪 店舗オーナーの方</p>
              <ul className="mt-4 grid gap-3">
                {[
                  "NotionやDB準備を、手取り足取り一緒に進めてほしい",
                  "導入後も「おかしいときに聞ける」サブスクが欲しい",
                  "LINE施策の効果や週次の数字を、感覚ではなくデータで持ちたい",
                ].map((text) => (
                  <li key={text} className="flex items-start gap-2 text-sm leading-7 text-violet-900">
                    <span className="mt-1 text-violet-500">✓</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-6 text-white shadow-lg sm:px-8 sm:py-8">
              <p className="text-lg font-bold sm:text-xl">🍴 飲食コンサルタントの方</p>
              <ul className="mt-4 grid gap-3">
                {[
                  "クライアントごとの初期セットアップを伴走で進めたい",
                  "デモ→本番移行まで、再現できる形で持ち込みたい",
                  "AI提案を叩き台に会議の質を上げたい",
                  "テナント・権限の整理まで含めて相談したい",
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
      <section className="bg-gradient-to-b from-stone-50 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-balance text-center text-xl font-bold text-stone-900 sm:text-3xl">
            導入の流れ（伴走型）
          </h2>
          <p className="mt-2 text-center text-xs text-stone-500 sm:text-sm">無料相談から、接続検証まで一緒に進めます</p>
          <div
            className="mx-auto mt-6 max-w-2xl rounded-2xl border border-violet-200 bg-violet-50/90 px-4 py-4 text-left text-sm leading-relaxed text-stone-700 shadow-sm sm:mt-8 sm:px-6 sm:py-5 sm:text-[15px] sm:leading-7"
            role="note"
          >
            <p className="font-semibold text-violet-950">初期設定について</p>
            <p className="mt-2">
              ご自身で進められるよう、セットアップ手順は
              <Link
                href="/lp/setup-guide"
                className="touch-manipulation font-semibold text-violet-700 underline-offset-2 hover:underline"
              >
                設定ガイド
              </Link>
              でお渡しします。一方で、
              <strong className="text-stone-800">APIキーやデータベースIDの入力ミス・権限の見落とし</strong>
              など、設定がわずかにでもズレると<strong className="text-stone-800">画面上にうまく反映されない／同期が途切れる</strong>
              ことがあります。
            </p>
            <p className="mt-3 text-stone-800">
              初回から確実に揃えたい方には、一緒に接続確認まで進める<strong>初期設定導入サポートプラン</strong>
              をおすすめします。まずは無料相談で、自分で進めるか／伴走するかをご相談ください。
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {[
              {
                step: "Step 0",
                emoji: "💬",
                title: "無料すり合わせ",
                desc: "現状・データの所在・サポートの厚みをオンラインで確認（15〜30分目安）。",
                color: "from-violet-500 to-violet-600",
              },
              {
                step: "Step 1",
                emoji: "📋",
                title: "Kickoff／権限確認",
                desc: "ワークスペース・売上データの所在を整理。インテグレーション共有まで伴走します。",
                color: "from-indigo-500 to-indigo-600",
              },
              {
                step: "Step 2",
                emoji: "🔗",
                title: "DB合わせ込み／検証",
                desc: "テンプレ複製または既存DBマッピング。Notion のAPIキーと各DB・ページのIDを設定し、動作確認まで。",
                color: "from-sky-500 to-sky-600",
                guideLink: { href: "/lp/setup-guide", label: "接続設定のテキストガイドへ" },
              },
              {
                step: "Step 3",
                emoji: "🚀",
                title: "運用開始＋サブスク",
                desc: "日次・週次の型を確認後、契約サブスク枠でトラブル切り分けや軽微な調整をフォロー。",
                color: "from-emerald-500 to-emerald-600",
              },
            ].map((item) => (
              <div key={item.step} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className={`bg-gradient-to-r ${item.color} px-5 py-3 sm:px-6 sm:py-4`}>
                  <p className="text-xs font-bold text-white/70">{item.step}</p>
                  <p className="mt-1 text-xl sm:text-2xl">{item.emoji}</p>
                </div>
                <div className="px-5 py-4 sm:px-6 sm:py-5">
                  <p className="text-[15px] font-semibold text-stone-900 sm:text-base">{item.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600 sm:leading-7">{item.desc}</p>
                  {"guideLink" in item && item.guideLink ? (
                    <p className="mt-3">
                      <Link
                        href={item.guideLink.href}
                        className="touch-manipulation font-medium text-violet-600 underline-offset-2 hover:underline"
                      >
                        {item.guideLink.label}
                      </Link>
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 料金 */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-balance text-center text-xl font-bold text-stone-900 sm:text-3xl">
            料金の考え方（一例）
          </h2>
          <p className="mt-2 px-1 text-center text-xs leading-relaxed text-stone-500 sm:text-sm sm:leading-normal">
            初期の導入支援と、継続のサポートサブスクを組み合わせます。金額・枠はヒアリング後にお見積りします。
          </p>
          <div className="mt-8 grid gap-5 sm:mt-12 sm:grid-cols-3 sm:gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl px-5 py-6 sm:px-7 sm:py-8 ${
                  plan.highlight
                    ? "relative z-[1] bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl sm:z-0 sm:scale-105"
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
                  href={
                    plan.cta === "お問い合わせ" || plan.cta === "無料相談"
                      ? `mailto:${CONTACT_EMAIL}`
                      : DEMO_URL
                  }
                  className={`touch-manipulation mt-8 flex min-h-12 items-center justify-center rounded-full py-3 text-center text-sm font-bold transition sm:min-h-0 sm:block sm:py-3 ${
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
      <section className="bg-gradient-to-br from-indigo-50 to-emerald-50 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="text-3xl sm:text-4xl">🎮</p>
          <h2 className="mt-4 text-balance text-xl font-bold text-stone-900 sm:text-3xl">操作デモで雰囲気を掴む</h2>
          <p className="mt-4 text-left text-[15px] leading-relaxed text-stone-600 sm:text-center sm:text-base sm:leading-8">
            架空データのデモで、画面とAIの操作感を確認できます。
            <span className="hidden sm:inline">
              <br />
            </span>
            <span className="sm:hidden"> </span>
            <strong className="text-stone-800">本番のNotion／DB合わせ込みは伴走プランで別途</strong>
            進めます。
          </p>
          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-indigo-200 bg-white px-5 py-5 text-left text-[13px] shadow-sm sm:inline-block sm:max-w-none sm:px-8 sm:py-6 sm:text-sm">
            <p className="font-semibold text-stone-900">デモアクセス情報</p>
            <div className="mt-3 grid gap-1 text-stone-600">
              <p>ユーザーID: <span className="font-mono font-bold text-violet-700">demo-viewer</span></p>
              <p>パスワード: <span className="text-stone-400">お問い合わせください（1営業日以内にご返信）</span></p>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
            <Link
              href={DEMO_URL}
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 px-6 py-3.5 text-base font-bold text-white shadow-lg hover:opacity-90 active:opacity-90 sm:w-auto sm:min-h-0 sm:px-8 sm:py-4"
            >
              デモ画面を開く →
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-full border border-stone-300 bg-white px-6 py-3.5 text-base font-semibold text-stone-700 hover:bg-stone-50 active:bg-stone-100 sm:w-auto sm:min-h-0 sm:px-8 sm:py-4"
            >
              パスワードを受け取る
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-balance text-center text-xl font-bold text-stone-900 sm:text-3xl">よくある質問</h2>
          <div className="mt-8 grid gap-3 sm:mt-10 sm:gap-4">
            {faqs.map((faq, i) => (
              <div key={faq.q} className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-4 sm:px-6 sm:py-5">
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
                  <p className="text-sm leading-relaxed text-stone-600 sm:leading-7">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* クロージング CTA */}
      <section className="bg-gradient-to-br from-violet-600 via-indigo-600 to-emerald-500 py-16 pb-[max(4rem,env(safe-area-inset-bottom))] pt-14 sm:py-28 sm:pb-[max(7rem,env(safe-area-inset-bottom))]">
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-balance text-2xl font-bold leading-snug text-white sm:text-4xl sm:leading-tight">
            契約で終わらせない、
            <br />
            回るところまで伴走する。
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/75 sm:max-w-none sm:text-base sm:leading-8">
            DBの準備から週次でAIが読めるデータになるところまで。
            <span className="hidden sm:inline">
              <br />
            </span>
            <span className="sm:hidden"> </span>
            まずは無料相談で、現状とご希望をお聞かせください。
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:mt-10 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-full bg-white px-6 py-3.5 text-base font-bold text-violet-700 shadow-xl hover:shadow-2xl active:opacity-95 sm:w-auto sm:min-h-0 sm:px-8 sm:py-4"
            >
              無料相談する →
            </a>
            <Link
              href={DEMO_URL}
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-full border border-white/40 px-6 py-3.5 text-base font-semibold text-white hover:bg-white/10 active:bg-white/15 sm:w-auto sm:min-h-0 sm:px-8 sm:py-4"
            >
              操作デモを開く
            </Link>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t border-stone-100 bg-white py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-10">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-stone-400 sm:px-6">
          <p className="bg-gradient-to-r from-violet-600 to-emerald-500 bg-clip-text text-sm font-bold text-transparent">
            AI Maneger
          </p>
          <p className="mt-1">Notion × AI × 飲食運用（伴走型導入）</p>
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
