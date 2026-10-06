// Supabase/PostgREST caps a single response at 1,000 rows and silently truncates the rest.
// Use this for any query that can match more than 1,000 rows (e.g. the whole savings ledger),
// otherwise sums/balances computed from the result come out too low.
//
//   const rows = await fetchAll<{ type: string; amount: number }>((from, to) =>
//     supabase.from('savings').select('type, amount').order('id').range(from, to));
//
// Always include a stable `.order(...)` so pages don't overlap or skip rows.
const PAGE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
