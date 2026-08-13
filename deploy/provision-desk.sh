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

say "자동 로그인과 화면 절전"
sudo raspi-config nonint do_boot_behaviour B4
sudo raspi-config nonint do_blanking 1

RC="$HOME/.config/labwc/rc.xml"
say "창을 다른 모니터로 옮기는 단축키 (Super+O)"
if [ ! -f "$RC" ]; then
  mkdir -p "$(dirname "$RC")"
  cat > "$RC" <<'EOF'
<?xml version="1.0"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <keyboard>
    <keybind key="W-o">
      <action name="ToggleFullscreen"/>
      <action name="MoveToOutput" direction="right" wrap="yes"/>
      <action name="ToggleFullscreen"/>
    </keybind>
  </keyboard>
</openbox_config>
EOF
  echo "만들었습니다: $RC"
elif grep -q MoveToOutput "$RC"; then
  echo "이미 있습니다: $RC"
else
  echo "$RC 가 이미 있어 건드리지 않았습니다. 아래를 직접 넣으세요."
  cat <<'EOF'
  <keyboard>
    <keybind key="W-o">
      <action name="ToggleFullscreen"/>
      <action name="MoveToOutput" direction="right" wrap="yes"/>
      <action name="ToggleFullscreen"/>
    </keybind>
  </keyboard>
EOF
fi

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
