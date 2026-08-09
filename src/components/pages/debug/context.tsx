import { BugReport } from "@mui/icons-material";
import { DebugCard } from "./card";
import { FormSwitch, FormTextField } from "../../elements/forms";
import { Stack } from "@mui/material";
import { TooltipIconButton } from "../../elements/buttons";
import { useForm, useWatch } from "react-hook-form";
import { useMemo, type FC } from "react";
import { useTopBar } from "../../../contexts";

export const ContextViewer: FC<{ data: object }> = ({ data }) => (
  <DebugCard title="App Context">
    <pre>{JSON.stringify(data, (key: string, value: unknown): unknown => (key === "rightActionButtons" ? "[ReactNode]" : value), 2)}</pre>
  </DebugCard>
);

export const TopBarController: FC = () => {
  const { control } = useForm({ defaultValues: { visible: true, title: "Debug Page" } });
  const { title, visible } = useWatch({ control });

  useTopBar(useMemo(
    () => (visible
      ? {
          title: title || "Debug Page",
          rightActionButtons: <TooltipIconButton tooltip="Report bug" icon={BugReport} onClick={() => alert("Bug reported!")} />,
        }
      : null),
    [title, visible],
  ));

  return (
    <DebugCard title="TopBar Controls">
      <Stack spacing={2}>
        <FormSwitch name="visible" control={control} label="상단바 표시" />
        <FormTextField name="title" control={control} inputProps={{ label: "TopBar Title", fullWidth: true, size: "small", disabled: !visible }} />
      </Stack>
    </DebugCard>
  );
};
