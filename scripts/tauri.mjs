import { spawn } from "node:child_process";
import { createServer } from "node:net";

const DEFAULT_DEV_PORT = 5173;

function isDevCommand(args) {
  return args[0] === "dev"
    || ((args[0] === "android" || args[0] === "ios") && args[1] === "dev");
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
