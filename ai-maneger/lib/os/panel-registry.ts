import type { AgentKey, Phase } from "@/types/os";

/**
 * ドメインパネル登録簿。
 * - ここに1行足すだけでダッシュボードにパネルが増える。
 * - データ（DomainPanel）が無い、または enabled=false のときは「準備中 Phase N」の将来枠として表示される。
 * - feeds は README / 実装者向けの「どのテーブル・APIから埋めるか」メモ（UIでも小さく表示）。
 */
export interface PanelDefinition {
  key: string;
  title: string;
  icon: string; // 絵文字（依存ライブラリなし）
  agentKey: AgentKey;
  group: "sales" | "marketing" | "customer" | "operations" | "finance" | "web";
  order: number;
  enabled: boolean;
  phase?: Phase; // 未実装時に表示するフェーズ
  feeds: string[];
  description?: string;
}

export const PANEL_REGISTRY: PanelDefinition[] = [
  {
    key: "sales_pos",
    title: "売上・POS（USEN）",
    icon: "🧾",
    agentKey: "sales",
    group: "sales",
    order: 10,
    enabled: true,
    feeds: ["metrics_snapshots(source=notion_sales)", "findings(agent=sales)", "Notion 日次売上DB"],
  },
  {
    key: "finance",
    title: "財務（損益・損益分岐）",
    icon: "💴",
    agentKey: "finance",
    group: "finance",
    order: 20,
    enabled: true,
    feeds: ["metrics_snapshots(source=finance)", "tenant設定: 損益分岐売上"],
  },
  {
    key: "meo",
    title: "MEO（Googleビジネスプロフィール）",
    icon: "📍",
    agentKey: "acquisition",
    group: "marketing",
    order: 30,
    enabled: true,
    feeds: ["metrics_snapshots(source=gbp)", "GBP内部API /api/internal/marketing/metrics", "findings(agent=acquisition)"],
  },
  {
    key: "instagram",
    title: "Instagram",
    icon: "📸",
    agentKey: "sns",
    group: "marketing",
    order: 40,
    enabled: true,
    feeds: ["metrics_snapshots(source=instagram)", "post_history / scheduled_posts", "findings(agent=sns)"],
  },
  {
    key: "seo",
    title: "SEO（Search Console）",
    icon: "🔎",
    agentKey: "seo",
    group: "web",
    order: 50,
    enabled: true,
    feeds: ["POST /api/os/ingest ← サーチコンソール専用 bot", "metrics_snapshots(source=gsc)"],
  },
  {
    key: "ga4",
    title: "アクセス（GA4）",
    icon: "📈",
    agentKey: "seo",
    group: "web",
    order: 60,
    enabled: true,
    feeds: ["POST /api/os/ingest ← サーチコンソール（アナリティクス）専用 bot", "metrics_snapshots(source=ga4)"],
  },
  {
    key: "line",
    title: "LINE公式",
    icon: "💬",
    agentKey: "customer",
    group: "customer",
    order: 70,
    enabled: true,
    phase: 4,
    feeds: ["Notion 日次売上DB（LINE登録数・LINE来店数）", "LINE Messaging API（Phase 4）"],
  },
  {
    key: "inquiry",
    title: "問い合わせ",
    icon: "✉️",
    agentKey: "customer",
    group: "customer",
    order: 80,
    enabled: true,
    feeds: ["POST /api/os/ingest ← メール専用 bot（件数・分類のみ）"],
  },
  {
    key: "operations",
    title: "業務改善",
    icon: "🛠️",
    agentKey: "operations",
    group: "operations",
    order: 90,
    enabled: true,
    feeds: ["Notion 週次アクションDB / 判断メモDB", "findings(agent=operations)"],
  },
  {
    key: "customer_db",
    title: "顧客DB",
    icon: "👥",
    agentKey: "customer",
    group: "customer",
    order: 100,
    enabled: false,
    phase: 4,
    feeds: ["チャットボット顧客メモリ（同意済み・匿名）", "LINE ID連携"],
  },
  {
    key: "inventory",
    title: "在庫・仕入れ",
    icon: "📦",
    agentKey: "inventory",
    group: "operations",
    order: 110,
    enabled: false,
    phase: 6,
    feeds: ["仕入れ伝票CSV / 在庫棚卸", "商品原価DB（Notion）"],
  },
  {
    key: "website",
    title: "Webサイト（WordPress / Next.js）",
    icon: "🌐",
    agentKey: "marketing",
    group: "web",
    order: 120,
    enabled: false,
    phase: 4,
    feeds: ["WordPress REST API", "Next.js サイトのビルド/フォーム"],
  },
  {
    key: "calendar",
    title: "カレンダー（予約・行事）",
    icon: "📅",
    agentKey: "operations",
    group: "operations",
    order: 130,
    enabled: false,
    phase: 4,
    feeds: ["Google Calendar API", "仕出し・法事予約"],
  },
];

/** 将来枠（パネル以外の機能）。追加するだけで「準備中」カードに出る */
export interface FutureSlot {
  key: string;
  title: string;
  description: string;
  phase: Phase;
}

export const FUTURE_SLOTS: FutureSlot[] = [
  { key: "external_exec", title: "外部送信の承認付き実行", description: "LINE配信・口コミ返信・Instagram投稿を、承認後に最終確認して送信", phase: 3 },
  { key: "effect_measure", title: "施策の効果測定（前後比較）", description: "完了した仕事の7〜14日後の数値変化を自動記録", phase: 3 },
  { key: "agent_meeting_log", title: "エージェント会議ログ", description: "各専門AIの議論とManagerの統合判断を時系列で表示", phase: 4 },
  { key: "preference_learning", title: "判断傾向レポート", description: "承認・却下の傾向から『社長の好みルール』を提案（承認制）", phase: 5 },
  { key: "multi_store", title: "他店舗・デモ比較", description: "テナント横断のベンチマーク（SaaS展開時）", phase: 6 },
  { key: "cashflow", title: "資金繰り・予算", description: "月次損益・資金繰り予測と損益分岐シミュレーション", phase: 6 },
];

export function sortedPanels() {
  return [...PANEL_REGISTRY].sort((a, b) => a.order - b.order);
}
