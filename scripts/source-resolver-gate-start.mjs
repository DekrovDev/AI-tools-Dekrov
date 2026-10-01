import { spawn } from "node:child_process";
import { openSync } from "node:fs";

// Never leave a background shell with a credential in its environment/memory.
// This short-lived setup process exits after delivering the key over stdin.
const key = process.env.API_KEY;
delete process.env.API_KEY;
if (!key) throw new Error("Missing API credential.");
const log = openSync(process.env.RUNNER_TEMP + "/gate.log", "wx", 0o600);
const child = spawn("sudo", ["env", "-u", "NODE_OPTIONS", "node", "--disable-sigusr1",
  "/opt/source-resolver-budget/scripts/source-resolver-budget.mjs",
  "/opt/source-resolver-budget/.github/source-resolver/policy.json",
  "/opt/source-resolver-budget/gate-token", "/opt/source-resolver-budget/audit.json"],
{ detached: true, stdio: ["pipe", log, log], env: process.env });
child.on("error", error => { console.error(error.message); process.exit(1); });
child.stdin.end(key);
child.unref();
