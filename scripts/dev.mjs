#!/usr/bin/env node
/**
 * `npm run dev` at the repo root: the API (backend/.env) and the web app in
 * http mode, with the web app proxying /api/v1 to the API.
 *
 *   web  http://localhost:3000   api  http://127.0.0.1:4000/api/v1
 *
 * PostgreSQL must be running (see scripts/local-postgres.sh or your own server).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(root, "backend/.env"))) {
  console.error("backend/.env is missing: copy backend/.env.example and fill in the database settings.");
  process.exit(1);
}

const colors = { api: "\x1b[35m", web: "\x1b[36m" };
const children = [];

function run(name, cwd, env = {}) {
  const child = spawn("npm", ["run", "dev"], { cwd: join(root, cwd), env: { ...process.env, ...env }, stdio: "pipe" });
  const prefix = `${colors[name]}[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited (${code ?? "signal"})\n`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("api", "backend");
run("web", "frontend", { NEXT_PUBLIC_API_MODE: "http", API_PROXY_TARGET: "http://127.0.0.1:4000" });
