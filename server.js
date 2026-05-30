import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT || 4317);
const ROOT = resolve(import.meta.dirname, "public");

const presets = [
  {
    id: "pulse",
    label: "Pulse",
    path: "/Users/greg/dev/pulse",
    command: "npm run build && npm run typecheck && npm run test:unit",
    expectedOrigin: "github.com/Flow-Forge-Lab-Team/pulse",
    pullBranch: "main",
    note: "Best day-to-day Next.js/Vitest/TypeScript benchmark.",
  },
  {
    id: "hermes-agent",
    label: "Hermes Agent fork",
    path: "/Users/greg/dev/hermes-agent",
    command: "taskpolicy -a env HERMES_TEST_WORKERS=10 scripts/run_tests.sh -q --tb=short",
    expectedOrigin: "github.com/flowforgelab/hermes-agent",
    pullBranch: "main",
    note: "Your fork of NousResearch/hermes-agent. Uses the repo test wrapper with 10 workers for local benchmarking.",
  },
  {
    id: "openclaw",
    label: "OpenClaw fork",
    path: "/Users/greg/dev/openclaw",
    command: "pnpm test",
    expectedOrigin: "github.com/flowforgelab/openclaw",
    pullBranch: "main",
    note: "Your fork of openclaw/openclaw. Clone it to this path on each machine before running.",
  },
  {
    id: "webpage-redesigner",
    label: "Webpage Redesign",
    path: "/Users/greg/dev/Webpage_redesigner",
    command: "npm run build && npm run test:unit",
    note: "Good frontend build and unit test benchmark.",
  },
  {
    id: "nuesynergy-proposal",
    label: "NueSynergy Proposal",
    path: "/Users/greg/dev/Nuesynergy",
    command: "npm run build && npm test && npm run lint",
    note: "Next.js, Prisma, lint, and Vitest.",
  },
  {
    id: "car-search",
    label: "Car Search",
    path: "/Users/greg/dev/car_search",
    command: "npm run build && npm test && npm run verify:scheduling-readiness",
    note: "Focused app benchmark with richer domain tests.",
  },
  {
    id: "social-media-automation",
    label: "Social Media Automation",
    path: "/Users/greg/dev/Social_Media_Automation",
    command: "bun run typecheck && bun test",
    note: "Bun test and TypeScript check benchmark.",
  },
  {
    id: "ghl-teams",
    label: "GHL Teams",
    path: "/Users/greg/dev/GHL-Teams",
    command: "npm run build && npm test",
    note: "Small TypeScript build plus Node test benchmark.",
  },
  {
    id: "winemembers",
    label: "WineMembers",
    path: "/Users/greg/dev/winemembers",
    command: "npm test",
    note: "Playwright-heavy benchmark.",
  },
];

let activeRun = null;
let lastRun = null;

const json = (response, status, body) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
};

const readBody = (request) =>
  new Promise((resolveBody, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
      }
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });

const presetById = (id) => presets.find((preset) => preset.id === id);

const resolveJob = (body) => {
  const preset = presetById(body.presetId);
  const repoPath = resolve(body.repoPath || preset?.path || "");
  const command = String(body.command || preset?.command || "").trim();

  if (!repoPath || repoPath === "/") {
    throw new Error("Choose a repo path.");
  }
  if (!existsSync(repoPath)) {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }
  if (!command) {
    throw new Error("Choose a benchmark command.");
  }

  return { repoPath, command };
};

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const runCommand = ({ repoPath, command, mode }) =>
  new Promise((resolveRun) => {
    if (activeRun) {
      resolveRun({ ok: false, code: null, elapsedMs: 0, output: "Another command is already running." });
      return;
    }

    const startedAt = process.hrtime.bigint();
    const lines = [];
    const child = spawn("bash", ["-lc", command], {
      cwd: repoPath,
      env: { ...process.env, FORCE_COLOR: "0", CI: process.env.CI || "1" },
    });

    activeRun = { child, mode, repoPath, command, startedAt, lines };

    const append = (chunk) => {
      lines.push(chunk.toString());
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);

    child.on("close", (code) => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      lastRun = {
        mode,
        repoPath,
        command,
        code,
        elapsedMs,
        output: lines.join("").trim(),
      };
      activeRun = null;
      resolveRun({
        ok: code === 0,
        code,
        elapsedMs,
        output: lines.join("").trim(),
      });
    });
  });

const buildPullCommand = (preset) => {
  const remoteCheck = preset?.expectedOrigin
    ? `expected_origin=${shellQuote(preset.expectedOrigin)}; origin_url="$(git remote get-url origin)"; case "$origin_url" in *"$expected_origin"*) ;; *) echo "Origin remote is $origin_url"; echo "Expected origin to contain $expected_origin"; exit 3 ;; esac`
    : "";
  const pull = preset?.pullBranch
    ? `git pull --ff-only origin ${shellQuote(preset.pullBranch)}`
    : "git pull --ff-only";

  return [
    'if [ -n "$(git status --porcelain)" ]; then echo "Worktree has local changes; commit, stash, or clean them before pulling."; git status --short; exit 2; fi',
    remoteCheck,
    preset ? "git fetch --prune origin" : "git fetch --prune",
    pull,
  ]
    .filter(Boolean)
    .join("; ");
};

const runStatus = () => {
  if (activeRun) {
    return {
      active: true,
      mode: activeRun.mode,
      repoPath: activeRun.repoPath,
      command: activeRun.command,
      elapsedMs: Number(process.hrtime.bigint() - activeRun.startedAt) / 1_000_000,
      output: activeRun.lines.join("").trim(),
    };
  }

  return {
    active: false,
    lastRun,
  };
};

const serveStatic = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const contents = await readFile(filePath);
    const type =
      extname(filePath) === ".css"
        ? "text/css; charset=utf-8"
        : extname(filePath) === ".js"
          ? "text/javascript; charset=utf-8"
          : "text/html; charset=utf-8";
    response.writeHead(200, { "content-type": type });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/presets") {
      const run = activeRun
        ? {
            mode: activeRun.mode,
            repoPath: activeRun.repoPath,
            command: activeRun.command,
          }
        : null;
      json(response, 200, { presets, activeRun: run });
      return;
    }

    if (request.method === "GET" && request.url === "/api/run-status") {
      json(response, 200, runStatus());
      return;
    }

    if (request.method === "POST" && request.url === "/api/pull") {
      const body = JSON.parse(await readBody(request));
      const preset = presetById(body.presetId);
      const pullCommand = buildPullCommand(preset);
      const job = resolveJob({ ...body, command: pullCommand });
      const result = await runCommand({ ...job, command: pullCommand, mode: "pull" });
      json(response, 200, result);
      return;
    }

    if (request.method === "POST" && request.url === "/api/run") {
      const body = JSON.parse(await readBody(request));
      const job = resolveJob(body);
      const result = await runCommand({ ...job, mode: "benchmark" });
      json(response, 200, result);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    json(response, 400, { ok: false, error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Vibe benchmark tool running at http://127.0.0.1:${PORT}`);
});
