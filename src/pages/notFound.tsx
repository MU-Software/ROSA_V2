import { Container, Stack, Typography } from "@mui/material";
import { useMemo, type FC } from "react";
import { Link, useLocation } from "react-router";
import { useTopBar } from "../contexts";

export const NotFoundPage: FC = () => {
  const { pathname } = useLocation();
  useTopBar(useMemo(() => ({ title: "페이지를 찾을 수 없음" }), []));

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h4">404</Typography>
        <Typography variant="body1" color="text.secondary">
          <code>{pathname}</code> 경로가 없습니다. <Link to="/">홈으로</Link>
        </Typography>
      </Stack>
    </Container>
  );
};
