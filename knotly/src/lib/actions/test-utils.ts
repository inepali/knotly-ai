// src/lib/actions/test-utils.ts — a tiny chainable Supabase stand-in for action tests.
// Every query on a table consumes the next queued result for that table (the last one repeats).
import type { SupabaseClient } from "@supabase/supabase-js";

type Res = { data?: unknown; error?: { message: string } | null };

export function mockSb(tables: Record<string, Res | Res[]> = {}, rpc: Res = { data: [] }) {
  const queues = new Map<string, Res[]>(
    Object.entries(tables).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]])
  );
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  const next = (table: string): Res => {
    const q = queues.get(table) ?? [];
    const r = q.length > 1 ? q.shift()! : q[0];
    return { data: r?.data ?? null, error: r?.error ?? null };
  };

  const from = (table: string) => {
    let res: Res | null = null;
    const result = () => (res ??= next(table));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic proxy
    const chain: any = new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === "then")
            return (resolve: (v: Res) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(result()).then(resolve, reject);
          return (...args: unknown[]) => {
            calls.push({ table, method, args });
            return chain;
          };
        },
      }
    );
    return chain;
  };

  const sb = {
    from,
    rpc: (name: string, args: unknown) => {
      calls.push({ table: `rpc:${name}`, method: "rpc", args: [args] });
      return Promise.resolve({ data: rpc.data ?? null, error: rpc.error ?? null });
    },
  } as unknown as SupabaseClient;

  return {
    sb,
    calls,
    called: (table: string, method: string) => calls.filter((c) => c.table === table && c.method === method),
  };
}

export const UUID = "123e4567-e89b-42d3-a456-426614174000";
