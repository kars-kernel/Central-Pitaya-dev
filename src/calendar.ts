export const activityLevel = (minutes: number) =>
  minutes <= 0
    ? 0
    : minutes < 30
      ? 1
      : minutes < 60
        ? 2
        : minutes < 120
          ? 3
          : 4;
export function calendarDays(
  year: number,
): Array<{ date: string; inYear: boolean; month: number; day: number }> {
  const first = new Date(Date.UTC(year, 0, 1));
  const last = new Date(Date.UTC(year, 11, 31));
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + 6 - end.getUTCDay());
  const days = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1))
    days.push({
      date: d.toISOString().slice(0, 10),
      inYear: d.getUTCFullYear() === year,
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
    });
  return days;
}
