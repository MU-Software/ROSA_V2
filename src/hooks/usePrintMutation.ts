import { useCallback, useEffect, useRef, useState } from "react";
import { printerManager, type PrinterDevice, type PrintOptions } from "../apis/printer";
import { drawImageData } from "../printing/raster";
import { RcptImage } from "../printing/receipet";

export type PrintMutationVariables = {
  device: PrinterDevice;
  image: ImageData | RcptImage;
  copies?: number;
};

export type PrintMutationResult = {
  device: PrinterDevice;
  completionConfirmed: boolean;
};

export type UsePrintMutationOptions = {
  onSuccess?: (result: PrintMutationResult, variables: PrintMutationVariables) => void;
  onError?: (error: Error, variables: PrintMutationVariables) => void;
};

export type UsePrintMutationResult = {
  mutate: (variables: PrintMutationVariables) => void;
  mutateAsync: (variables: PrintMutationVariables) => Promise<PrintMutationResult>;
  reset: () => void;
  isPending: boolean;
  data: PrintMutationResult | null;
  error: Error | null;
};

const toError = (reason: unknown): Error => reason instanceof Error ? reason : new Error(String(reason));

/** 프린터 연결과 ImageData 변환을 포함해 한 번의 인쇄를 mutation 형태로 실행한다. */
export function usePrintMutation(options: UsePrintMutationOptions = {}): UsePrintMutationResult {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const operationRef = useRef(0);
  const [isPending, setIsPending] = useState(false);
  const [data, setData] = useState<PrintMutationResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(async (variables: PrintMutationVariables): Promise<PrintMutationResult> => {
    const operation = ++operationRef.current;
    setIsPending(true);
    setData(null);
    setError(null);

    let ownedImage: RcptImage | undefined;
    try {
      if (!printerManager.isConnected(variables.device.key)) {
        await printerManager.connect(variables.device.key);
      }

      const image = variables.image instanceof RcptImage
        ? variables.image
        : await RcptImage.create(variables.image.width, variables.image.height);
      if (!(variables.image instanceof RcptImage)) {
        ownedImage = image;
        drawImageData(image, variables.image);
      }

      const printOptions: PrintOptions = { ...(variables.copies === undefined ? {} : { copies: variables.copies }) };
      await printerManager.print(variables.device.key, image, printOptions);
      const result: PrintMutationResult = {
        device: variables.device,
        completionConfirmed: printerManager.canConfirmCompletion(variables.device.key),
      };
      if (operation === operationRef.current) {
        setData(result);
        optionsRef.current.onSuccess?.(result, variables);
      }
      return result;
    } catch (reason) {
      const nextError = toError(reason);
      if (operation === operationRef.current) {
        setError(nextError);
        optionsRef.current.onError?.(nextError, variables);
      }
      throw nextError;
    } finally {
      ownedImage?.free();
      if (operation === operationRef.current) setIsPending(false);
    }
  }, []);

  const mutate = useCallback((variables: PrintMutationVariables) => {
    void mutateAsync(variables).catch(() => undefined);
  }, [mutateAsync]);

  const reset = useCallback(() => {
    operationRef.current += 1;
    setIsPending(false);
    setData(null);
    setError(null);
  }, []);

  return { mutate, mutateAsync, reset, isPending, data, error };
}
