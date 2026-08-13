import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, resolve as resolvePath } from "node:path";

const DEFAULT_DEV_PORT = 5173;
const APPLE_RSYNC = "/usr/bin/rsync";
const RSYNC_SHIM_DIR = resolvePath("node_modules/.cache/rosa-apple-rsync");
const TAURI_CONF = resolvePath("src-tauri/tauri.conf.json");
const BUNDLE_VERSION = /("bundleVersion"\s*:\s*")(\d+)(")/g;

function isDevCommand(args) {
  return args[0] === "dev"
    || ((args[0] === "android" || args[0] === "ios") && args[1] === "dev");
}

function isAppStoreBuild(args) {
  if (args[0] !== "ios" || args[1] !== "build") return false;
  // 빌드 번호를 직접 주면 그쪽이 이긴다.
  if (args.includes("--build-number")) return false;
  const at = args.indexOf("--export-method");
  return at !== -1 && args[at + 1] === "app-store-connect";
}

// App Store 는 같은 CFBundleVersion 을 두 번 받지 않는다. Tauri 의 --build-number 는
// 이 값을 `0.1.0.N` 으로 만드는데 마침표 4개는 Apple 규격(정수 1~3개) 밖이고, Tauri 가
// ExportOptions 에 manageAppVersionAndBuildNumber 를 켜 두어 Xcode 가 export 단계에서
// 그런 값을 제멋대로 다시 매긴다. 규격 안에 있는 정수 하나를 여기서 직접 올린다.
// 되돌리는 함수를 반환한다 — 빌드가 실패했는데 번호만 앞서 나가지 않게 한다.
function bumpBundleVersion() {
  const before = readFileSync(TAURI_CONF, "utf8");
  const found = [...before.matchAll(BUNDLE_VERSION)];
  if (found.length !== 1) {
    throw new Error(
      `${TAURI_CONF} 에서 정수 하나짜리 "bundleVersion" 을 찾지 못했습니다`
      + ` (${found.length}개). bundle.iOS 아래에 "bundleVersion": "1" 을 두세요.`,
    );
  }
  const [whole, head, current, tail] = found[0];
  const next = String(Number(current) + 1);
  writeFileSync(TAURI_CONF, before.replace(whole, `${head}${next}${tail}`));
  console.log(`ROSA iOS 빌드 번호: ${current} → ${next}`);
  return () => {
    writeFileSync(TAURI_CONF, before);
    console.log(`ROSA iOS 빌드 번호를 ${current} 로 되돌립니다.`);
  };
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

const restoreBundleVersion = isAppStoreBuild(args) ? bumpBundleVersion() : null;

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(pnpm, ["exec", "tauri", ...args], {
  env,
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
if (exitCode !== 0) restoreBundleVersion?.();
process.exitCode = exitCode;
