import { Box, Container, Paper, Stack, useMediaQuery, type Theme } from "@mui/material";
import type { FC, PropsWithChildren, ReactNode } from "react";
import type { RegistrationDeskGateway } from "../../gateways";
import { useRegistrationStatisticsQuery } from "../../hooks/useRegistrationDesk";
import type { QrScannerStatus } from "../../hooks/useQrScanner";
import { useAppLayoutState } from "../../contexts/appLayout";
import { QueryBoundary } from "../elements/queryBoundary";
import { DeviceStatusPanel, RegistrationStatisticsPanel } from "../pages/home/sidebar";

type CameraStatus = {
  status: QrScannerStatus;
  error: Error | null;
};

export const RegistrationDeskLayout: FC<PropsWithChildren<{
  gateway: RegistrationDeskGateway | null;
  banner?: ReactNode;
  camera?: CameraStatus;
}>> = ({ banner, camera, children, gateway }) => {
  const { sidebarVisible } = useAppLayoutState();
  const isNarrow = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  return (
    <Box sx={{ minHeight: "calc(100dvh - 64px)", bgcolor: "grey.50" }}>
      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
        {banner}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: sidebarVisible
              ? { xs: "1fr", lg: "minmax(0, 1fr) 300px", xl: "minmax(0, 1fr) 320px" }
              : "minmax(0, 1fr)",
            gap: 3,
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              minHeight: { xs: 400, md: 620 },
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {children}
          </Paper>

          {sidebarVisible && (
            <Stack spacing={3}>
              {gateway ? (
                <QueryBoundary>
                  <RegistrationStatisticsQuery gateway={gateway} defaultExpanded={!isNarrow} />
                </QueryBoundary>
              ) : (
                <RegistrationStatisticsPanel
                  defaultExpanded={!isNarrow}
                  statistics={null}
                  error="등록 통계 gateway가 준비되지 않았습니다."
                  requestedAt={null}
                  refreshing={false}
                  onRefresh={() => undefined}
                />
              )}
              <DeviceStatusPanel defaultExpanded={!isNarrow} camera={camera} />
            </Stack>
          )}
        </Box>
      </Container>
    </Box>
  );
};

const RegistrationStatisticsQuery: FC<{
  gateway: RegistrationDeskGateway;
  defaultExpanded: boolean;
}> = ({ gateway, defaultExpanded }) => {
  const { data, dataUpdatedAt, isFetching, refetch } = useRegistrationStatisticsQuery(gateway);

  return (
    <RegistrationStatisticsPanel
      defaultExpanded={defaultExpanded}
      statistics={data}
      error={null}
      requestedAt={dataUpdatedAt}
      refreshing={isFetching}
      onRefresh={() => void refetch()}
    />
  );
};
