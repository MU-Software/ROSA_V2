# 등록 데스크에 설치할 arm64 .deb 를 만든다. 대상과 같은 Debian bookworm 에서
# 빌드해야 webkit·glibc ABI 가 맞는다. `--platform linux/arm64` 로만 쓴다.
#
#   pnpm build
#   docker build --platform linux/arm64 -t rosa-deb-builder deploy
#   docker run --rm --platform linux/arm64 -u "$(id -u):$(id -g)" -v "$PWD:/work" rosa-deb-builder
#
# 결과: src-tauri/target/linux-arm64/release/bundle/deb/ROSA_<버전>_arm64.deb
#
# 프론트엔드는 컨테이너에서 빌드하지 않는다. @mu-software/receipet 이 GitHub Packages 에
# 있고 그 레지스트리는 공개 패키지도 익명 접근을 막기 때문에, `dist` 는 개발 기기에서
# 만들어 넘긴다.
FROM rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget file pkg-config libssl-dev ca-certificates \
      libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev libxdo-dev \
      libudev-dev libusb-1.0-0-dev \
 && rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=24.19.0
RUN curl -sSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1

# package.json 의 @tauri-apps/api 와 major/minor 가 같아야 CLI 가 빌드를 시작한다.
ARG TAURI_CLI_VERSION=2.10.1
RUN npm install -g "@tauri-apps/cli@${TAURI_CLI_VERSION}"

# 호스트 사용자로 실행하므로 cargo 캐시를 아무나 쓸 수 있어야 한다.
RUN chmod -R a+w "$CARGO_HOME"

# 호스트의 macOS 산출물과 섞이지 않게 별도 디렉터리에 쌓는다.
ENV CARGO_TARGET_DIR=/work/src-tauri/target/linux-arm64

WORKDIR /work
CMD ["tauri", "build", "--bundles", "deb", "--config", "{\"build\":{\"beforeBuildCommand\":\"\"}}"]
