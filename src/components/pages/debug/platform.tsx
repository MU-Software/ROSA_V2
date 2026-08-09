import { Alert, Chip, Stack, Typography } from "@mui/material";
import type { FC } from "react";
import { getPlatformCapabilities, type PlatformCapability } from "../../../utils/platform";
import { DebugCard } from "./card";

const CapabilityRow: FC<{ label: string; capability: PlatformCapability }> = ({ label, capability }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
    <Chip
      size="small"
      color={capability.available ? "success" : "default"}
      label={capability.available ? "지원" : "미지원"}
    />
    <Typography variant="body2" sx={{ minWidth: 90 }}>{label}</Typography>
    <Typography variant="caption" color="text.secondary">{capability.detail}</Typography>
  </Stack>
);

export const PlatformDebugCard: FC = () => {
  const capabilities = getPlatformCapabilities();
  const noneAvailable = !capabilities.usb.available && !capabilities.bluetoothPrinter.available;

  return (
    <DebugCard title={`Platform · ${capabilities.platform}`}>
      <Stack spacing={1.5}>
        <CapabilityRow label="QR 카메라" capability={capabilities.camera} />
        <CapabilityRow label="시리얼" capability={capabilities.serial} />
        <CapabilityRow label="USB 프린터" capability={capabilities.usb} />
        <CapabilityRow label="Bluetooth 프린터" capability={capabilities.bluetoothPrinter} />
        {noneAvailable && (
          <Alert severity="warning">이 환경에는 현재 사용할 수 있는 프린터 전송 방식이 없습니다.</Alert>
        )}
      </Stack>
    </DebugCard>
  );
};
