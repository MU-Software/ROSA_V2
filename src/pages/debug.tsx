import { Container, Typography } from "@mui/material";
import type { FC } from "react";
import { ContextViewer, TopBarController } from "../components/pages/debug/context";
import { PrinterDebugCard } from "../components/pages/debug/printer";
import { PlatformDebugCard } from "../components/pages/debug/platform";
import { QrDebugCard } from "../components/pages/debug/qr";
import { QrInputDebugCard } from "../components/pages/debug/qrInput";
import { SerialDebugCard } from "../components/pages/debug/serial";
import { UsbDebugCard } from "../components/pages/debug/usb";
import { useAppContext } from "../contexts";

export const DebugPage: FC = () => {
  const { isTauri, topBarInfo } = useAppContext();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>Debug Page</Typography>

      <ContextViewer data={{ isTauri, topBarInfo }} />
      <TopBarController />
      <PlatformDebugCard />
      <QrInputDebugCard />
      <SerialDebugCard />
      <QrDebugCard />
      <UsbDebugCard />
      <PrinterDebugCard />
    </Container>
  );
};
