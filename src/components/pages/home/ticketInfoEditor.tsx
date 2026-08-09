import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FC, type FormEvent } from "react";
import type { TicketInfo } from "../../../domain";

export const TicketInfoEditor: FC<{
  ticketInfo: TicketInfo;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (ticketInfo: TicketInfo) => Promise<unknown>;
}> = ({ ticketInfo: initialTicketInfo, saving, error, onClose, onSave }) => {
  const [ticketInfo, setTicketInfo] = useState(initialTicketInfo);
  const valid = !!ticketInfo.name.trim() &&
    !!ticketInfo.phone.trim() &&
    !!ticketInfo.email.trim();

  const close = () => {
    if (!saving) onClose();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || saving) return;
    try {
      await onSave({
        name: ticketInfo.name.trim(),
        phone: ticketInfo.phone.trim(),
        email: ticketInfo.email.trim(),
        organization: ticketInfo.organization?.trim() || null,
        contribution_message: ticketInfo.contribution_message?.trim() || null,
      });
    } catch {
      return;
    }
    onClose();
  };

  return (
    <Dialog open onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>참가자 정보 수정</DialogTitle>
      <Box component="form" onSubmit={(event) => void save(event)}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              수정한 정보는 명찰 미리보기와 출력에 사용됩니다.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              autoFocus
              required
              fullWidth
              label="이름"
              value={ticketInfo.name}
              disabled={saving}
              slotProps={{ htmlInput: { autoComplete: "name" } }}
              onChange={(event) => setTicketInfo((current) => ({
                ...current,
                name: event.target.value,
              }))}
            />
            <TextField
              fullWidth
              label="소속"
              value={ticketInfo.organization ?? ""}
              disabled={saving}
              slotProps={{ htmlInput: { autoComplete: "organization" } }}
              onChange={(event) => setTicketInfo((current) => ({
                ...current,
                organization: event.target.value,
              }))}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              <TextField
                required
                fullWidth
                label="연락처"
                type="tel"
                value={ticketInfo.phone}
                disabled={saving}
                slotProps={{ htmlInput: { autoComplete: "tel" } }}
                onChange={(event) => setTicketInfo((current) => ({
                  ...current,
                  phone: event.target.value,
                }))}
              />
              <TextField
                required
                fullWidth
                label="이메일"
                type="email"
                value={ticketInfo.email}
                disabled={saving}
                slotProps={{ htmlInput: { autoComplete: "email" } }}
                onChange={(event) => setTicketInfo((current) => ({
                  ...current,
                  email: event.target.value,
                }))}
              />
            </Box>
            <TextField
              multiline
              minRows={3}
              fullWidth
              label="기여 메시지"
              value={ticketInfo.contribution_message ?? ""}
              disabled={saving}
              onChange={(event) => setTicketInfo((current) => ({
                ...current,
                contribution_message: event.target.value,
              }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={close}>취소</Button>
          <Button type="submit" variant="contained" disabled={saving || !valid}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};
