export function yen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function num(value: number) {
  return Math.round(value).toLocaleString("ja-JP");
}

export function pct(value: number, digits = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** ISO / YYYY-MM-DD を JST 表示に */
export function jstDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+09:00` : iso);
  const f = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });
  const w = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short" }).format(d);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
  return `${f.format(d)}（${WEEK[idx]}）`;
}

export function jstTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function jstDateTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
