import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useAppContext } from "../contexts";
import { parseOrderProductScancode, transitionRegistration } from "../domain";
import type { RegistrationDeskGateway } from "../gateways";
import { useRegistrationDeskQueryClient } from "./useRegistrationDesk";

export const useManualRegistration = (gateway: RegistrationDeskGateway | null) => {
  const navigate = useNavigate();
  const {
    automatic_registration_enabled: automaticRegistrationEnabled,
    registration_state: registrationState,
    setAppContext,
  } = useAppContext();
  const registrationDeskQueryClient = useRegistrationDeskQueryClient(gateway);
  const runRef = useRef(false);
  const mutation = useMutation({
    mutationFn: async (rawScancode: string) => {
      if (!gateway) throw new Error("등록 데스크 gateway가 준비되지 않았습니다.");
      const scancode = parseOrderProductScancode(rawScancode);
      const product = await registrationDeskQueryClient.fetchOrderProductByScancode(scancode);
      registrationDeskQueryClient.setOrderProduct(product);
      return product;
    },
    onSuccess: (product) => {
      setAppContext((current) => ({
        ...current,
        registration_state: current.registration_state === "idle"
          ? transitionRegistration(current.registration_state, "registering")
          : current.registration_state,
        order_product_relation: product,
        farewell_until: null,
      }));
      void navigate(`/order-products/${product.id}`, { replace: true });
    },
    onSettled: () => {
      runRef.current = false;
    },
  });
  const { error, isPending, mutate, reset } = mutation;
  const openScannedProduct = useCallback((value: string) => {
    if (
      automaticRegistrationEnabled ||
      registrationState !== "idle" ||
      isPending ||
      runRef.current
    ) return;

    runRef.current = true;
    reset();
    mutate(value);
  }, [automaticRegistrationEnabled, isPending, mutate, registrationState, reset]);

  return { error, isPending, openScannedProduct, reset };
};
