import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { reserveRequest, requireThat } from "./source-resolver-lib.mjs";

// Ephemeral root-owned localhost gate, not an external service. The official
// Action's root proxy receives a disposable gate token, NEVER the API key.
// Its documented upstream endpoint override targets this gate. Drop-sudo
// prevents the model from reading the root process. All reservations count,
// including upstream failures: there are no hidden/free retry assumptions.
export async function startBudgetGate({ policy, key, gateToken, port = 8201, upstream = fetch, audit = async () => {} }) {
  requireThat(key && gateToken, "Missing isolated API credential/gate token.");
  const budget = { requests: 0, reserved: 0 };
  let active = false;
  const server = http.createServer(async (request, response) => {
    let acquired = false;
    try {
      requireThat(request.method === "POST" && request.url === "/v1/responses" && request.headers.authorization === `Bearer ${gateToken}` && !active, "Unauthorized/parallel gate request.");
      active = true;
      acquired = true;
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; requireThat(size <= policy.maxRequestBytes, "Request size limit."); chunks.push(chunk); }
      const input = reserveRequest(policy, budget, Buffer.concat(chunks).toString("utf8"));
      await audit({ ...budget });
      const result = await upstream("https://api.openai.com/v1/responses", { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(120000) });
      response.writeHead(result.status, { "Content-Type": result.headers.get("content-type") || "application/json" });
      await pipeline(Readable.fromWeb(result.body), response);
    } catch {
      if (!response.headersSent) response.writeHead(429, { "Content-Type": "application/json" });
      if (!response.destroyed) response.end(JSON.stringify({ error: { message: "Resolver budget/auth/request gate rejected execution.", type: "resolver_gate" } }));
    } finally { if (acquired) active = false; }
  });
  server.requestTimeout = 150000;
  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
  return { server, budget };
}

if (process.argv[1]?.endsWith("source-resolver-budget.mjs")) {
  const [policyPath, tokenPath, auditPath] = process.argv.slice(2);
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  requireThat(policy.productionEnabled === true, "Production is disabled in committed policy.");
  const gateToken = (await readFile(tokenPath, "utf8")).trim();
  let key = "";
  for await (const chunk of process.stdin) { key += chunk; requireThat(key.length < 4096, "Oversized API credential."); }
  await startBudgetGate({ policy, key: key.trim(), gateToken, audit: data => writeFile(auditPath, JSON.stringify(data), { mode: 0o600 }) });
}
