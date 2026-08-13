import { AppBar, Box, Toolbar, Typography } from "@mui/material";
import type { FC } from "react";
import { useAppContext } from "../../contexts";
import { useAppLayoutState } from "../../contexts/appLayout";

export const TopBar: FC = () => {
  const { topBarInfo } = useAppContext();
  const { topBarVisible } = useAppLayoutState();
  if (!topBarVisible || !topBarInfo) return null;

  return (
    <AppBar position="sticky">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          {topBarInfo.title}
        </Typography>
        {topBarInfo.rightActionButtons && (
          <Box sx={{ display: "flex", gap: 1 }}>
            {topBarInfo.rightActionButtons}
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};
