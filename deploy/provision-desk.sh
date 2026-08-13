#!/bin/sh
# 등록 데스크 한 대를 설정한다. 데스크에서 직접 실행하고, 여러 번 돌려도 된다.
#
#   ./provision-desk.sh ROSA_0.1.0_arm64.deb [호스트명]
set -eu

DEB=${1:-}
HOSTNAME_NEW=${2:-}
HERE=$(cd "$(dirname "$0")" && pwd)

if [ -z "$DEB" ] || [ ! -f "$DEB" ]; then
  echo "사용법: $0 <ROSA_*.deb> [호스트명]" >&2
  exit 1
fi

say() { printf '\n== %s\n' "$1"; }

say "패키지 설치"
sudo apt-get install -y "$(realpath "$DEB")"

say "장치 접근 권한"
# 시리얼은 dialout, USB 프린터는 패키지가 넣은 udev 규칙이 plugdev 로 연다.
sudo usermod -aG dialout,plugdev "$USER"
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=usb

say "자동 실행"
mkdir -p "$HOME/.config/systemd/user" "$HOME/.config/autostart" "$HOME/.local/state"
install -m 644 "$HERE/rosa.service" "$HOME/.config/systemd/user/rosa.service"
sudo install -m 755 "$HERE/rosa-session-start" /usr/local/bin/rosa-session-start
cat > "$HOME/.config/autostart/rosa.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=ROSA
Exec=/usr/local/bin/rosa-session-start
X-GNOME-Autostart-enabled=true
EOF
systemctl --user daemon-reload

say "등록 데스크에 필요 없는 데몬 정리"
# 부팅 직후 SD 카드 I/O 를 잡아먹고, 행사 중에 뒤에서 apt 가 도는 것도 막는다.
# ROSA 는 libusb 로 프린터를 직접 열기 때문에 CUPS 를 쓰지 않는다.
# e2scrub 은 LVM 스냅숏 검사라 LVM 이 없으면 할 일이 없다.
for unit in \
  ModemManager.service \
  cups.service cups.socket cups.path cups-browsed.service \
  e2scrub_reap.service \
  apt-daily.timer apt-daily-upgrade.timer
do
  if sudo systemctl disable --now "$unit" >/dev/null 2>&1; then
    echo "  껐습니다: $unit"
  else
    echo "  없거나 이미 꺼져 있습니다: $unit"
  fi
done
# PackageKit 은 static 이라 끌 수 없고 D-Bus 로 언제든 깨어난다.
if sudo systemctl mask packagekit.service >/dev/null 2>&1; then
  echo "  막았습니다: packagekit.service"
fi
# rpi-connect 는 남긴다. 현장에서 원격으로 손볼 수단이 필요하다.

say "자동 로그인과 화면 절전"
sudo raspi-config nonint do_boot_behaviour B4
sudo raspi-config nonint do_blanking 1

say "창 배치 규칙과 단축키 (Super+O)"
# labwc 는 찾은 첫 rc.xml 하나만 읽는다. 사용자 파일을 새로 만들면 시스템 설정이 통째로
# 사라지므로 — 테마, Ctrl+Alt+Del 종료, 전원 버튼, 볼륨 키까지 — 그것을 복사해서 시작한다.
python3 - "$HOME/.config/labwc/rc.xml" <<'EOF'
import pathlib, shutil, sys

rc = pathlib.Path(sys.argv[1])
system_rc = pathlib.Path("/etc/xdg/labwc/rc.xml")

if not rc.exists():
    rc.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(system_rc, rc)
    print(f"시스템 설정을 복사했습니다: {rc}")

text = rc.read_text()
if "MoveToOutput" in text:
    print("이미 들어 있습니다")
    raise SystemExit

keybind = """    <keybind key="W-o">
      <action name="ToggleFullscreen"/>
      <action name="MoveToOutput" direction="right" wrap="yes"/>
      <action name="ToggleFullscreen"/>
    </keybind>
"""
if "<keyboard>" in text:
    text = text.replace("<keyboard>", "<keyboard>\n" + keybind, 1)
else:
    text = text.replace(
        "</openbox_config>", "  <keyboard>\n" + keybind + "  </keyboard>\n</openbox_config>", 1
    )

# Wayland 에서는 앱이 자기 창의 출력을 고를 수 없다. 외부 화면을 주 창과 다른 모니터로
# 보내고 전체화면으로 만드는 일은 컴포지터가 한다. 출력 이름은 기기마다 달라 방향으로 쓴다.
rule = """    <windowRule title="ROSA 외부 화면" matchOnce="false">
      <action name="MoveToOutput" direction="right" wrap="yes"/>
      <action name="ToggleFullscreen"/>
    </windowRule>
"""
if "<windowRules>" in text:
    text = text.replace("<windowRules>", "<windowRules>\n" + rule, 1)
else:
    text = text.replace(
        "</openbox_config>", "  <windowRules>\n" + rule + "  </windowRules>\n</openbox_config>", 1
    )

rc.write_text(text)
print(f"창 규칙과 단축키를 넣었습니다: {rc}")
EOF

if [ -n "$HOSTNAME_NEW" ]; then
  say "호스트명 $HOSTNAME_NEW"
  sudo raspi-config nonint do_hostname "$HOSTNAME_NEW"
fi

cat <<'EOF'

끝났습니다. 재부팅하면 로그인 없이 ROSA 가 뜹니다.

재부팅 뒤 데스크마다 한 번씩 해야 하는 것:
  1. 서버 주소 입력과 로그인
  2. QR 리더 등록 (장치 진단 > 기기 추가 > 라벨 할당 > 스캔)
  3. 프린터 연결
  4. 조작 화면이 엉뚱한 모니터에 떴으면 Super+O
EOF
