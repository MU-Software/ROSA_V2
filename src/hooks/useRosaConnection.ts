import { useMutation } from "@tanstack/react-query";
import { connectRosa, type RosaConnection } from "../apis/rosaDiscovery";
import { RegistrationDeskHttpError } from "../gateways";

export type CheckedRosaConnection = {
  connection: RosaConnection;
  authenticated: boolean;
};

const checkSession = async (connection: RosaConnection): Promise<CheckedRosaConnection> => {
  try {
    await connection.gateway.getSession();
    return { connection, authenticated: true };
  } catch (error) {
    if (error instanceof RegistrationDeskHttpError && error.status === 403) {
      return { connection, authenticated: false };
    }
    throw error;
  }
};

export const useConnectRosaMutation = () => useMutation({
  mutationKey: ["mutation", "rosa", "connect"],
  mutationFn: async (serverOrigin: string) => checkSession(await connectRosa(serverOrigin)),
});

export const useCheckRosaSessionMutation = () => useMutation({
  mutationKey: ["mutation", "rosa", "check-session"],
  mutationFn: checkSession,
});

export const useRosaLoginMutation = (connection: RosaConnection) => useMutation({
  mutationKey: ["mutation", "rosa", "login"],
  mutationFn: ({ email, password }: { email: string; password: string }) =>
    connection.gateway.login(email, password),
});

export const useRosaLogoutMutation = () => useMutation({
  mutationKey: ["mutation", "rosa", "logout"],
  mutationFn: (connection: RosaConnection) => connection.gateway.logout(),
});
