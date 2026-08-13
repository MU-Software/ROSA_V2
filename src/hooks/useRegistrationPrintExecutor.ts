import { useCallback } from "react";
import { printerManager, type PrinterDevice } from "../apis/printer";
import {
  type PrintJobExecutor,
  type RegistrationPrintData,
} from "../printing/queue";
import { renderRegistrationPrintJob } from "../printing/registrationJobRenderer";
import { usePrintMutation } from "./usePrintMutation";

const getRegisteredPrinter = async (): Promise<PrinterDevice> => {
  let printer = printerManager.listRegisteredDevices()[0];
  if (!printer) {
    await printerManager.refresh();
    printer = printerManager.listRegisteredDevices()[0];
  }
  if (!printer) throw new Error("장치 진단에서 프린터를 먼저 등록해주세요.");
  return printer;
};

export const useRegistrationPrintExecutor = (): {
  execute: PrintJobExecutor<RegistrationPrintData>;
  isPending: boolean;
} => {
  const printMutation = usePrintMutation();
  const { mutateAsync } = printMutation;

  const execute = useCallback<PrintJobExecutor<RegistrationPrintData>>(async (entry) => {
    const printer = await getRegisteredPrinter();
    if (!printerManager.isConnected(printer.key)) await printerManager.connect(printer.key);
    const { width, height } = printerManager.imageSize(printer.key);
    if (!height) throw new Error("프린터 라벨 높이가 설정되지 않았습니다.");
    const image = await renderRegistrationPrintJob(entry, width, height);
    const result = await mutateAsync({ device: printer, image });
    return { completion_confirmed: result.completionConfirmed };
  }, [mutateAsync]);

  return { execute, isPending: printMutation.isPending };
};
