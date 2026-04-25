import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Route, Routes } from "react-router";
import { BrowserRouter } from "react-router";
import {
  Box,
  Container,
  CssBaseline,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import { isTauri } from "./adapters";

const theme = createTheme({
  colorSchemes: {
    dark: true,
  },
});

function Home() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>
        ROSA
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Platform: {isTauri() ? "Tauri (Native)" : "Web Browser"}
      </Typography>
    </Container>
  );
}

function App() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Box>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
