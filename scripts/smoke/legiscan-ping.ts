/** Quick one-call smoke test to confirm the LegiScan key works. */
import "../env.js";
import { fetchLegiscan } from "../sync/legiscan.js";

interface SearchResponse {
  status: string;
  searchresult?: {
    summary?: { count?: number; page_total?: number };
    [key: string]: unknown;
  };
}

async function main() {
  console.log("[smoke] pinging LegiScan getSearch VA 'data center'...");
  const res = await fetchLegiscan<SearchResponse>("getSearch", {
    state: "VA",
    query: "data center",
    year: 2,
  });
  const total = res.searchresult?.summary?.count ?? 0;
  console.log(`[smoke] OK — ${total} results for VA 'data center'`);
}

main().catch((e) => {
  console.error("[smoke] failed:", e.message);
  process.exit(1);
});
