import { Button, Chip, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import { useEffect, useState, type FC } from "react";
import { PhDialog } from "../components/elements/dialog";
import type { LearningSession } from "../apis/serial";

type Props = {
  session: LearningSession | null;
  dialogKey: string;
  currentDialogKey: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export const SerialLearningDialog: FC<Props> = ({ session, dialogKey, currentDialogKey, onConfirm, onCancel }) => {
  const [assignments, setAssignments] = useState<Map<number, string>>(new Map());
  const [portData, setPortData] = useState<Record<number, string>>({});

  // effect 로 초기화하면 한 프레임 늦게 반영된다.
  const [trackedSession, setTrackedSession] = useState(session);
  if (session !== trackedSession) {
    setTrackedSession(session);
    setAssignments(new Map(session?.getAssignments() ?? []));
    setPortData({});
  }

  useEffect(() => {
    if (!session) return;

    return session.onData((portIndex, data) => {
      const decoded = new TextDecoder().decode(data);
      setPortData((prev) => ({ ...prev, [portIndex]: decoded }));

      const current = session.getAssignments();
      if (current.has(portIndex)) return;
      const assignedLabels = new Set(current.values());
      const nextLabel = session.pendingLabels.find((l) => !assignedLabels.has(l));
      if (!nextLabel) return;
      try {
        session.assign(portIndex, nextLabel);
        setAssignments(new Map(session.getAssignments()));
      } catch (err) {
        console.error("Auto-assign failed:", err);
      }
    });
  }, [session]);

  const reset = () => {
    if (!session) return;
    for (let i = 0; i < session.portCount; i++) session.unassign(i);
    setAssignments(new Map());
  };

  const isComplete = !!session && assignments.size === session.pendingLabels.length;
  const nextLabel = session?.pendingLabels.find((l) => !Array.from(assignments.values()).includes(l));

  return (
    <PhDialog title="Scanner Learning" dialogKey={dialogKey} currentDialogKey={currentDialogKey} size="md">
      <Stack spacing={2}>
        <Typography variant="body2">
          각 라벨에 해당하는 스캐너로 QR 코드를 한 번씩 스캔하세요. 데이터가 들어온 포트가 자동으로 다음 라벨에 매핑됩니다.
        </Typography>

        {nextLabel && (
          <Typography variant="body1" color="primary">
            지금 스캔할 라벨: <strong>{nextLabel}</strong>
          </Typography>
        )}

        <Typography variant="subtitle2">
          학습 진행 ({assignments.size}/{session?.pendingLabels.length ?? 0})
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {session?.pendingLabels.map((label) => {
            const portIdx = Array.from(assignments.entries()).find(([, l]) => l === label)?.[0];
            return (
              <Chip
                key={label}
                label={portIdx !== undefined ? `${label} ← port-${portIdx}` : label}
                color={portIdx !== undefined ? "success" : "default"}
              />
            );
          })}
        </Stack>

        <Typography variant="subtitle2">감지된 포트</Typography>
        <List dense>
          {session && Array.from({ length: session.portCount }, (_, i) => {
            const info = session.portInfos[i];
            const idLabel = info.vid !== undefined
              ? `port-${i} (vid:${info.vid?.toString(16)} pid:${info.pid?.toString(16)})`
              : `port-${i}`;
            const assigned = assignments.get(i);
            const lastData = portData[i]?.trim();
            return (
              <ListItem key={i}>
                <ListItemText
                  primary={idLabel}
                  secondary={
                    assigned ? `→ ${assigned}${lastData ? ` (last: ${lastData})` : ""}`
                    : lastData ? `Last: ${lastData}`
                    : "(no data yet)"
                  }
                />
              </ListItem>
            );
          })}
        </List>

        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button onClick={reset} disabled={assignments.size === 0}>Reset</Button>
          <Button onClick={onCancel} color="error">Cancel</Button>
          <Button onClick={onConfirm} variant="contained" disabled={!isComplete}>Confirm</Button>
        </Stack>
      </Stack>
    </PhDialog>
  );
};
