import { ArrowBack } from "@mui/icons-material";
import {
  AppBar,
  Dialog,
  DialogContent,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import { type FC, type PropsWithChildren } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAppLayout } from "../../contexts/appLayout";

export const FullScreenRouteDialog: FC<PropsWithChildren<{ title: string }>> = ({
  children,
  title,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  useAppLayout({ topBarVisible: false, sidebarVisible: false });

  const close = () => {
    if (location.key === "default") {
      void navigate("/", { replace: true });
      return;
    }
    void navigate(-1);
  };

  return (
    <Dialog fullScreen open onClose={close}>
      <AppBar position="relative">
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={close} aria-label="돌아가기">
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ ml: 2, flex: 1 }}>
            {title}
          </Typography>
        </Toolbar>
      </AppBar>
      <DialogContent sx={{ p: 0, bgcolor: "grey.50" }}>{children}</DialogContent>
    </Dialog>
  );
};
