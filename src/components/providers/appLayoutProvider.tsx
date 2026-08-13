import { useMemo, useState, type FC, type PropsWithChildren } from "react";
import {
  AppLayoutContext,
  DEFAULT_APP_LAYOUT_STATE,
} from "../../contexts/appLayout";

export const AppLayoutProvider: FC<PropsWithChildren> = ({ children }) => {
  const [state, setAppLayout] = useState(DEFAULT_APP_LAYOUT_STATE);
  const value = useMemo(() => ({ ...state, setAppLayout }), [state]);

  return <AppLayoutContext.Provider value={value}>{children}</AppLayoutContext.Provider>;
};
