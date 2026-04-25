import { BugReport } from "@mui/icons-material";
import { Card, Container, Stack, Typography } from "@mui/material";
import { useEffect, type FC } from "react";
import { useForm, useWatch } from "react-hook-form";
import { TooltipIconButton } from "../components/elements/buttons";
import { FormSwitch, FormTextField } from "../components/elements/forms";
import { useAppContext, type AppContextType } from "../contexts";

const DebugCard: FC<{ title: string } & React.PropsWithChildren> = ({ title, children }) => (
  <Card sx={{ mt: 4, p: 2 }}>
    <Typography variant="h6" gutterBottom>{title}</Typography>
    {children}
  </Card>
);

const ContextViewer: FC<{ data: object }> = ({ data }) => {
  return (
    <DebugCard title="App Context">
      <pre>{JSON.stringify(data, (key, value) => key === "rightActionButtons" ? "[ReactNode]" : value, 2)}</pre>
    </DebugCard>
  );
}

const TopBarController: FC<{ setAppContext: AppContextType["setAppContext"] }> = ({ setAppContext }) => {
  const { control } = useForm({ defaultValues: { visible: true, title: "Debug Page" }});
  const { title, visible } = useWatch({ control });
  useEffect(() => {
    setAppContext((prev) => ({
      ...prev,
      topBarInfo: visible ? {
        title: title || "Debug Page",
        rightActionButtons: <TooltipIconButton tooltip="Report bug" icon={BugReport} onClick={() => alert("Bug reported!")} />
      } : null,
    }));
    return () => setAppContext((prev) => ({ ...prev, topBarInfo: null }));
  }, [setAppContext, title, visible]);

  return (
    <DebugCard title="TopBar Controls">
      <Stack spacing={2}>
        <FormSwitch name="visible" control={control} />
        <FormTextField name="title" control={control} disabled={!visible} inputProps={{ label: "TopBar Title", fullWidth: true, size: "small" }} />
      </Stack>
    </DebugCard>
  );
}

export const DebugPage: FC = () => {
  const { setAppContext, ...appContext } = useAppContext()

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>Debug Page</Typography>

      <ContextViewer data={appContext} />
      <TopBarController setAppContext={setAppContext} />
    </Container>
  );
}
