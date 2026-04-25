import type { SvgIconComponent } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";
import { createElement, type FC, type MouseEventHandler } from "react";

type TooltipIconButtonProps = {
  tooltip: string;
  icon: SvgIconComponent;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export const TooltipIconButton: FC<TooltipIconButtonProps> = ({ tooltip, onClick, icon }) => (
  <Tooltip title={tooltip}>
    <IconButton color="inherit" onClick={onClick} children={createElement(icon)} />
  </Tooltip>
)
