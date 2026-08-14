import { Box, Stack, Typography } from "@mui/material";
import { useEffect, useState, type FC } from "react";
import type { PersistedAppState } from "../apis/appState";
import { useAppContext } from "../contexts";

type DisplayMessage = {
  title: string;
  subtitle: string | null;
};

const getDisplayMessage = (
  state: PersistedAppState,
  farewell: boolean,
): DisplayMessage => {
  const ticket = state.order_product_relation?.ticket_info;

  if (farewell) {
    return {
      title: "즐거운 파이콘 되세요!",
      subtitle: "Happy PyCon Korea!",
    };
  }
  if (state.registration_state === "closed") {
    return {
      title: "옆 창구를 이용해주세요.",
      subtitle: "Please use another desk.",
    };
  }
  if (state.registration_state === "idle") {
    return {
      title: "PyCon Korea",
      subtitle: "등록 데스크 · Registration Desk",
    };
  }
  if (state.registration_state === "awaiting_completion") {
    return {
      title: "등록을 진행하고 있습니다.",
      subtitle: null,
    };
  }

  return {
    title: ticket ? `${ticket.name}님, 안녕하세요!` : "등록을 진행하고 있습니다.",
    subtitle: ticket?.organization || "등록을 진행하고 있습니다.",
  };
};

export const ExternalDisplayPage: FC = () => {
  const appState = useAppContext();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!appState.farewell_until) return;

    const remaining = Math.max(0, appState.farewell_until - Date.now());
    const timeout = window.setTimeout(() => setNow(Date.now()), remaining);
    return () => window.clearTimeout(timeout);
  }, [appState.farewell_until]);

  const farewell = appState.farewell_until !== null && appState.farewell_until > now;
  const message = getDisplayMessage(appState, farewell);

  return (
    <Box
      component="main"
      sx={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "minmax(320px, 26%) minmax(0, 1fr)" },
        gridTemplateRows: { xs: "minmax(0, 0.9fr) minmax(0, 1.1fr)", sm: "1fr" },
        gap: { xs: 1, sm: "clamp(1rem, 2.5vw, 3.5rem)" },
        alignItems: "center",
        p: { xs: 3, sm: "clamp(1.5rem, 6vmin, 5rem)" },
        bgcolor: "common.black",
        color: "common.white",
        "@media (min-aspect-ratio: 2/1)": {
          gridTemplateColumns: "minmax(320px, 22%) minmax(0, 1fr)",
          gridTemplateRows: "1fr",
          gap: "clamp(1.25rem, 2.5vw, 3.5rem)",
        },
      }}
    >
      <Box
        sx={{
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          display: "grid",
          placeItems: "center",
        }}
      >
        <EventLogo src={appState.event_logo_url} />
      </Box>

      <Stack
        spacing="clamp(1rem, 3vmin, 2.5rem)"
        sx={{
          minWidth: 0,
          alignItems: { xs: "center", sm: "flex-start" },
          justifyContent: "center",
          textAlign: { xs: "center", sm: "left" },
        }}
      >
        <Typography
          component="h1"
          sx={{
            maxWidth: "100%",
            fontSize: "clamp(2.75rem, min(7.5vw, 20vh), 9rem)",
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.045em",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
            textWrap: "balance",
          }}
        >
          {message.title}
        </Typography>
        {message.subtitle && (
          <Typography
            component="p"
            sx={{
              maxWidth: "100%",
              fontSize: "clamp(1.4rem, min(4vw, 11vh), 5rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              color: "rgba(255, 255, 255, 0.72)",
              wordBreak: "keep-all",
              overflowWrap: "anywhere",
            }}
          >
            {message.subtitle}
          </Typography>
        )}
      </Stack>

      <DisplayClock />
    </Box>
  );
};

const DisplayClock: FC = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const pad = (value: number) => String(value).padStart(2, "0");
  const time = [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  ].join(" ");

  return (
    <Typography
      component="time"
      dateTime={now.toISOString()}
      aria-label={`현재 시각 ${time}`}
      sx={{
        position: "fixed",
        right: "clamp(2rem, 5vmin, 5rem)",
        bottom: "clamp(0.75rem, 2vmin, 1.5rem)",
        color: "rgba(255, 255, 255, 0.56)",
        fontSize: "clamp(1.375rem, 2.5vmin, 2.25rem)",
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: "0.04em",
        fontVariantNumeric: "tabular-nums",
        userSelect: "none",
      }}
    >
      {time}
    </Typography>
  );
};

const EventLogo: FC<{ src: string | null }> = ({ src }) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (!src || failedSource === src) return <PythonKoreaLogo />;

  return (
    <Box
      component="img"
      src={src}
      alt="행사 로고"
      onError={() => setFailedSource(src)}
      sx={{
        display: "block",
        width: "min(320px, 100%, 68vh)",
        maxHeight: "100%",
        objectFit: "contain",
      }}
    />
  );
};

const PythonKoreaLogo: FC = () => (
  <Box
    component="svg"
    viewBox="0 0 226.667 226.667"
    aria-label="Python Korea"
    role="img"
    sx={{
      display: "block",
      width: "min(320px, 100%, 68vh)",
      height: "auto",
      aspectRatio: "1",
    }}
  >
    <defs>
      <clipPath id="python-korea-logo-clip">
        <path d="M0 170h170V0H0Z" />
      </clipPath>
    </defs>
    <g
      clipPath="url(#python-korea-logo-clip)"
      transform="matrix(1.33333 0 0 -1.33333 0 226.667)"
    >
      <path
        fill="#ca0b0f"
        d="M0 0c11.367 19.577 36.942 26.206 57.467 14.839 19.576-11.681 26.207-37.26 14.84-57.144C95.67-2.211 81.465 49.26 41.679 71.987 1.576 95.354-49.571 81.462-72.936 41.362-84.3 21.469-77.352-4.104-57.775-15.783-37.573-27.153-11.993-20.523 0 0"
        transform="translate(84.686 84.682)"
      />
      <path
        fill="#231759"
        d="M0 0c-11.365-20.21-36.942-26.841-57.148-14.842C-77.042-3.469-83.671 22.105-72.62 41.993-95.037 2.208-81.46-49.574-41.677-72.938c40.098-22.416 91.25-8.528 114.935 30.942C84.62-22.102 77.675 3.785 57.783 15.467 37.574 26.835 12.002 19.892 0 0"
        transform="translate(85.001 85.631)"
      />
      <path
        fill="#fff"
        d="M0 0a3.77 3.77 0 1 0 0 7.539A3.77 3.77 0 0 0 0 0m13.269 13.419c-19.149 0-22.013-5.276-22.013-8.142V-4.825H11.46V-7.69h-29.855s-11.007.754-11.007-18.545c0-19.301 7.539-20.809 9.8-20.809h8.144v10.104S-12.666-25.783 0-25.783h20.054s11.007-1.659 11.007 9.197V4.071s1.358 9.348-17.792 9.348"
        transform="translate(73.112 108.77)"
      />
      <path
        fill="#fff"
        d="M0 0a3.77 3.77 0 1 0 0-7.54A3.77 3.77 0 0 0 0 0m19.17 48.099h-8.142V37.997s1.205-11.159-11.46-11.159h-20.054s-11.007 1.659-11.007-9.197V-3.016s-1.356-9.347 17.792-9.347c19.151 0 22.014 5.275 22.014 8.141V5.88h-20.204v2.864h29.855s11.008-.754 11.008 18.547c0 19.3-7.541 20.808-9.802 20.808"
        transform="translate(95.73 53.735)"
      />
    </g>
  </Box>
);
