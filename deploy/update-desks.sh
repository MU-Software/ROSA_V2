#!/bin/sh
# 새 빌드를 데스크들에 밀어넣는다. 행사 중에 쓰는 빠른 경로다.
#
#   ./update-desks.sh ROSA_0.1.0_arm64.deb rosa-desk-1 rosa-desk-2
set -eu

DEB=${1:-}
shift 2>/dev/null || true

if [ -z "$DEB" ] || [ ! -f "$DEB" ] || [ $# -eq 0 ]; then
  echo "사용법: $0 <ROSA_*.deb> <호스트> [호스트...]" >&2
  exit 1
fi

NAME=$(basename "$DEB")

for host in "$@"; do
  printf '\n== %s\n' "$host"
  scp -q "$DEB" "$host:/tmp/$NAME"
  ssh "$host" "sudo apt-get install -y /tmp/$NAME && rm -f /tmp/$NAME && systemctl --user restart rosa.service"
  echo "완료"
done
