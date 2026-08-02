import { Container, Stack, Typography } from "@mui/material";
import { useMemo, type FC } from "react";
import { Link } from "react-router";
import { useTopBar } from "../contexts";

export const HomePage: FC = () => {
  useTopBar(useMemo(() => ({ title: "ROSA" }), []));

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h4">ROSA</Typography>
        <Typography variant="body1" color="text.secondary">
          기능 화면은 아직 준비 중입니다. 장치 연결 상태는 <Link to="/debug">디버그 페이지</Link>에서 확인할 수 있습니다.
        </Typography>
      </Stack>
    </Container>
  );
};
