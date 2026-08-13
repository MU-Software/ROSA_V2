import { useCallback } from "react";
import { printerManager, type PrinterDevice } from "../apis/printer";
import {
  getRegistrationPrintKind,
  type PrintJobExecutor,
  type RegistrationPrintData,
} from "../printing/queue";
import type { RegistrationPrintKind } from "../printing/output";
import { renderRegistrationPrintJob } from "../printing/registrationJobRenderer";
import { usePrintMutation } from "./usePrintMutation";

const getRegisteredPrinter = async (kind: RegistrationPrintKind): Promise<PrinterDevice> => {
  let printers = printerManager.listRegisteredDevices();
  let routedPrinter = printerManager.getPrintRoute(kind);
  if (!routedPrinter && (printerManager.hasPrintRoute(kind) || printers.length === 0)) {
    await printerManager.refresh();
    printers = printerManager.listRegisteredDevices();
    routedPrinter = printerManager.getPrintRoute(kind);
  }
  const printer = routedPrinter ?? printers[0];
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
    const printer = await getRegisteredPrinter(getRegistrationPrintKind(entry.job.template_id));
    if (!printerManager.isConnected(printer.key)) await printerManager.connect(printer.key);
    const { width, height } = printerManager.imageSize(printer.key);
    if (!height) throw new Error("프린터 라벨 높이가 설정되지 않았습니다.");
    const image = await renderRegistrationPrintJob(entry, width, height);
    const result = await mutateAsync({ device: printer, image });
    return { completion_confirmed: result.completionConfirmed };
  }, [mutateAsync]);

  return { execute, isPending: printMutation.isPending };
};
