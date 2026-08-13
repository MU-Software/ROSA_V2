import {
  createContext,
  useContext,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
} from "react";

export type AppLayoutState = {
  topBarVisible: boolean;
  sidebarVisible: boolean;
};

export const DEFAULT_APP_LAYOUT_STATE: AppLayoutState = {
  topBarVisible: true,
  sidebarVisible: true,
};

export type AppLayoutContextValue = AppLayoutState & {
  setAppLayout: Dispatch<SetStateAction<AppLayoutState>>;
};

export const AppLayoutContext = createContext<AppLayoutContextValue | undefined>(undefined);

const useAppLayoutContext = (): AppLayoutContextValue => {
  const context = useContext(AppLayoutContext);
  if (!context) throw new Error("useAppLayoutContext must be used within an AppLayoutProvider");
  return context;
};

export const useAppLayoutState = (): AppLayoutState => {
  const { topBarVisible, sidebarVisible } = useAppLayoutContext();
  return { topBarVisible, sidebarVisible };
};

export const useAppLayout = ({
  topBarVisible,
  sidebarVisible,
}: AppLayoutState): void => {
  const { setAppLayout } = useAppLayoutContext();

  useLayoutEffect(() => {
    setAppLayout({ topBarVisible, sidebarVisible });
    return () => setAppLayout(DEFAULT_APP_LAYOUT_STATE);
  }, [setAppLayout, sidebarVisible, topBarVisible]);
};
