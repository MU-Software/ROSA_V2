import type { FC } from "react";
import { PrinterPanel } from "../../printer/printerPanel";
import { DebugCard } from "./card";

export const PrinterPanelDebugCard: FC = () => (
  <DebugCard title="Printer Controller">
    <PrinterPanel />
  </DebugCard>
);
