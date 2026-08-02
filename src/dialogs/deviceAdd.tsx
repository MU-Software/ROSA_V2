import { Button, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import type { FC } from "react";
import type { PortInfo } from "../adapters";
import { PhDialog } from "../components/elements/dialog";

type Props = {
  dialogKey: string;
  currentDialogKey: string | null;
  ports: PortInfo[];
  registeredKeys: Set<string>;
  onAdd: (port: PortInfo) => void;
  onClose: () => void;
};

const describe = (p: PortInfo): string =>
  [p.manufacturer, p.product, p.serialNumber && `SN:${p.serialNumber}`].filter(Boolean).join(" · ") || p.portType;

export const DeviceAddDialog: FC<Props> = ({ dialogKey, currentDialogKey, ports, registeredKeys, onAdd, onClose }) => (
  <PhDialog title="기기 추가" dialogKey={dialogKey} currentDialogKey={currentDialogKey} size="sm" onCancel={onClose}>
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        연결할 시리얼 포트를 추가하세요. 통신 속도는 라벨 할당 때 자동으로 찾습니다.
      </Typography>
      <List dense>
        {ports.length === 0 && <ListItem><ListItemText primary="(감지된 포트 없음)" /></ListItem>}
        {ports.map((port) => {
          const added = registeredKeys.has(port.path);
          return (
            <ListItem
              key={port.path}
              secondaryAction={
                <Button size="small" disabled={added} onClick={() => onAdd(port)}>
                  {added ? "추가됨" : "추가"}
                </Button>
              }
            >
              <ListItemText primary={port.path} secondary={describe(port)} />
            </ListItem>
          );
        })}
      </List>
    </Stack>
  </PhDialog>
);
