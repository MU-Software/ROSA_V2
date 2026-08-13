import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { delimiter, resolve as resolvePath } from "node:path";

const DEFAULT_DEV_PORT = 5173;
const APPLE_RSYNC = "/usr/bin/rsync";
const RSYNC_SHIM_DIR = resolvePath("node_modules/.cache/rosa-apple-rsync");

function isDevCommand(args) {
  return args[0] === "dev"
    || ((args[0] === "android" || args[0] === "ios") && args[1] === "dev");
}

// Xcode 의 exportArchive 는 /usr/bin/rsync 를 절대 경로로 부르지만, 로컬 복사에도
// 서버 쪽 프로세스는 PATH 에서 `rsync` 이름으로 다시 찾는다. Homebrew rsync(3.x)가
// 먼저 잡히면 Apple rsync 의 -E(--extended-attributes)를 모른다며 IPA 생성이
// "Copy failed" 로 죽는다. Apple 것만 가리키는 shim 을 PATH 맨 앞에 둔다.
function prependAppleRsyncShim(env) {
  rmSync(RSYNC_SHIM_DIR, { recursive: true, force: true });
  mkdirSync(RSYNC_SHIM_DIR, { recursive: true });
  symlinkSync(APPLE_RSYNC, resolvePath(RSYNC_SHIM_DIR, "rsync"));
  env.PATH = `${RSYNC_SHIM_DIR}${delimiter}${env.PATH ?? ""}`;
}

function isAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    // Vite와 devUrl이 사용하는 localhost 주소 계열(IPv4 또는 IPv6)을 동일하게 검사한다.
    server.listen({ host: "localhost", port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(start) {
  for (let port = start; port <= 65535; port += 1) {
    if (await isAvailable(port)) return port;
  }
  throw new Error(`${start} 이상의 사용 가능한 개발 서버 포트를 찾지 못했습니다.`);
}

const args = process.argv.slice(2);
const env = { ...process.env };

if (isDevCommand(args)) {
  const devPort = await findAvailablePort(DEFAULT_DEV_PORT);
  const hmrPort = await findAvailablePort(devPort + 1);
  env.ROSA_DEV_PORT = String(devPort);
  env.ROSA_HMR_PORT = String(hmrPort);
  args.push(
    "--config",
    JSON.stringify({ build: { devUrl: `http://localhost:${devPort}` } }),
  );
  console.log(`ROSA 개발 서버 포트: ${devPort}`);
}

if (args[0] === "ios" && process.platform === "darwin") {
  prependAppleRsyncShim(env);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(pnpm, ["exec", "tauri", ...args], {
  env,
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
