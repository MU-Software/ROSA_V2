import { Alert, Stack, Typography } from "@mui/material";
import { useState, type FC } from "react";
import { QrInputPanel } from "../../qr/qrInputPanel";
import type { QrTriggerEvent } from "../../../hooks/useQrTrigger";
import { DebugCard } from "./card";

export const QrInputDebugCard: FC = () => {
  const [lastEvent, setLastEvent] = useState<QrTriggerEvent | null>(null);

  return (
    <DebugCard title="QR Input Waiter">
      <Stack spacing={2}>
        <Typography variant="caption" color="text.secondary">
          제품 입력 정책: Android/iOS 카메라 · 웹/데스크톱 Serial QR 리더
        </Typography>
        <QrInputPanel onDetected={setLastEvent} />
        {lastEvent && (
          <Alert severity="success" onClose={() => setLastEvent(null)} sx={{ wordBreak: "break-all" }}>
            <strong>{lastEvent.source}</strong> · {lastEvent.value}
          </Alert>
        )}
      </Stack>
    </DebugCard>
  );
};
