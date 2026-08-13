import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { androidpublisher, auth as googleAuth } from "@googleapis/androidpublisher";

const PACKAGE_NAME = "kr.co.musoftware.rosa";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_TRACK = "internal";
const SERVICE_ACCOUNT_PATH = process.env.ROSA_PLAY_SERVICE_ACCOUNT
  ?? "src-tauri/gen/android/play-service-account.json";
const AAB_PATH = "src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab";
const MAPPING_PATH = "src-tauri/gen/android/app/build/outputs/mapping/universalRelease/mapping.txt";
const TAURI_PROPERTIES_PATH = "src-tauri/gen/android/app/tauri.properties";

function parseArgs(argv) {
  const options = { skipBuild: false, track: DEFAULT_TRACK, notes: null, aab: AAB_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case "--skip-build": options.skipBuild = true; break;
      case "--track": options.track = argv[++i]; break;
      case "--notes": options.notes = argv[++i]; break;
      case "--aab": options.aab = argv[++i]; break;
      default: throw new Error(`알 수 없는 인자: ${argv[i]}`);
    }
  }
  return options;
}

function readTauriProperties() {
  if (!existsSync(TAURI_PROPERTIES_PATH)) return {};
  return Object.fromEntries(
    readFileSync(TAURI_PROPERTIES_PATH, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("//"))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
}

function createClient() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `서비스 계정 키가 없습니다: ${SERVICE_ACCOUNT_PATH}\n`
      + "docs/play-internal-testing.md 의 '서비스 계정' 절을 따라 발급받거나, "
      + "ROSA_PLAY_SERVICE_ACCOUNT 로 경로를 지정하세요.",
    );
  }
  const client = new googleAuth.GoogleAuth({
    keyFile: resolvePath(SERVICE_ACCOUNT_PATH),
    scopes: [SCOPE],
  });
  return androidpublisher({ version: "v3", auth: client });
}

async function nextVersionCode(play) {
  const { data: edit } = await play.edits.insert({ packageName: PACKAGE_NAME });
  try {
    const { data } = await play.edits.bundles.list({
      packageName: PACKAGE_NAME,
      editId: edit.id,
    });
    const codes = (data.bundles ?? []).map((bundle) => bundle.versionCode ?? 0);
    if (codes.length > 0) return Math.max(...codes) + 1;
  } finally {
    await play.edits.delete({ packageName: PACKAGE_NAME, editId: edit.id });
  }
  const fallback = readTauriProperties()["tauri.android.versionCode"];
  return fallback ? Number(fallback) : 1;
}

function build(versionCode) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/tauri.mjs", "android", "build", "--aab"],
      {
        env: { ...process.env, ROSA_ANDROID_VERSION_CODE: String(versionCode) },
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`android build 가 코드 ${code} 로 끝났습니다.`));
    });
  });
}

async function upload(play, options) {
  const { data: edit } = await play.edits.insert({ packageName: PACKAGE_NAME });
  const editId = edit.id;

  const { data: bundle } = await play.edits.bundles.upload({
    packageName: PACKAGE_NAME,
    editId,
    media: { mimeType: "application/octet-stream", body: createReadStream(options.aab) },
  });
  console.log(`업로드 완료: versionCode ${bundle.versionCode}`);

  // 없으면 Play 콘솔의 크래시 스택이 난독화된 채로 남는다.
  if (existsSync(MAPPING_PATH)) {
    await play.edits.deobfuscationfiles.upload({
      packageName: PACKAGE_NAME,
      editId,
      apkVersionCode: bundle.versionCode,
      deobfuscationFileType: "proguard",
      media: { mimeType: "application/octet-stream", body: createReadStream(MAPPING_PATH) },
    });
    console.log("ProGuard 매핑 업로드 완료");
  }

  const versionName = readTauriProperties()["tauri.android.versionName"] ?? "";
  await play.edits.tracks.update({
    packageName: PACKAGE_NAME,
    editId,
    track: options.track,
    requestBody: {
      track: options.track,
      releases: [{
        // completed 면 커밋 즉시 테스터에게 나간다. 내부 테스트 트랙은 심사가 없다.
        status: "completed",
        name: `${versionName} (${bundle.versionCode})`.trim(),
        versionCodes: [String(bundle.versionCode)],
        ...(options.notes ? { releaseNotes: [{ language: "ko-KR", text: options.notes }] } : {}),
      }],
    },
  });

  await play.edits.commit({ packageName: PACKAGE_NAME, editId });
  console.log(`${options.track} 트랙 배포 완료: versionCode ${bundle.versionCode}`);
}

const options = parseArgs(process.argv.slice(2));
const play = createClient();

if (options.skipBuild) {
  console.log(`빌드를 건너뜁니다. 기존 AAB 를 그대로 올립니다: ${options.aab}`);
} else {
  const versionCode = await nextVersionCode(play);
  console.log(`versionCode ${versionCode} 로 릴리스 AAB 를 빌드합니다.`);
  await build(versionCode);
}

if (!existsSync(options.aab)) {
  throw new Error(`AAB 가 없습니다: ${options.aab}`);
}

await upload(play, options);
