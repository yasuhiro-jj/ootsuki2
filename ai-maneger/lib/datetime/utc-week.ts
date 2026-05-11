/**
 * 基準日が含まれる週の「ひとつ前の」月曜〜日曜（UTC の暦日）を YYYY-MM-DD で返す。
 * Cron の週次ダイジェストで「直近で完了した週」を指す。
 */
export function getPreviousCompletedWeekUtcRange(reference = new Date()): {
  periodStart: string;
  periodEnd: string;
} {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const day = reference.getUTCDate();
  const dow = reference.getUTCDay();

  const offsetFromMonday = (dow + 6) % 7;
  const mondayThisWeekUtc = new Date(Date.UTC(y, m, day - offsetFromMonday));

  const prevMonday = new Date(mondayThisWeekUtc);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevSunday.getUTCDate() + 6);

  return {
    periodStart: prevMonday.toISOString().slice(0, 10),
    periodEnd: prevSunday.toISOString().slice(0, 10),
  };
}
