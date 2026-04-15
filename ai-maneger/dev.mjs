import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const clean = process.argv.includes("--clean");
if (clean) {
  const nextDir = resolve(".next");
  rmSync(nextDir, { recursive: true, force: true });
  console.log("Removed .next before starting dev server (--clean).");
}

const nextBin = resolve("node_modules/next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "dev", "--port", "3002"], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
