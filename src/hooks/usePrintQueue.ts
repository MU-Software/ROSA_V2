import { useCallback, useRef, useState } from "react";
import type {
  PrintJobExecution,
  PrintJobExecutor,
  PrintQueueEntry,
} from "../printing/queue";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "출력 중 알 수 없는 오류가 발생했습니다.";

export const usePrintQueue = <TData,>() => {
  const [executions, setExecutions] = useState<PrintJobExecution[]>([]);
  const [isPending, setIsPending] = useState(false);
  const executionsRef = useRef<PrintJobExecution[]>([]);
  const runningRef = useRef(false);

  const updateExecutions = useCallback((next: PrintJobExecution[]) => {
    executionsRef.current = next;
    setExecutions(next);
  }, []);

  const reset = useCallback(() => {
    runningRef.current = false;
    setIsPending(false);
    updateExecutions([]);
  }, [updateExecutions]);

  const run = useCallback(async (
    entries: readonly PrintQueueEntry<TData>[],
    executor: PrintJobExecutor<TData>,
    jobIds?: readonly string[],
  ): Promise<readonly PrintJobExecution[]> => {
    if (runningRef.current) return executionsRef.current;
    runningRef.current = true;
    setIsPending(true);

    const selectedIds = new Set(jobIds ?? entries.map(({ id }) => id));
    if (jobIds === undefined || executionsRef.current.length === 0) {
      updateExecutions(entries.map((entry) => ({
        id: entry.id,
        template_id: entry.job.template_id,
        status: "waiting",
        error: null,
        completion_confirmed: null,
      })));
    }

    try {
      for (const entry of entries) {
        if (!selectedIds.has(entry.id)) continue;
        updateExecutions(executionsRef.current.map((execution) => execution.id === entry.id
          ? { ...execution, status: "printing", error: null, completion_confirmed: null }
          : execution));

        try {
          const completion = await executor(entry);
          updateExecutions(executionsRef.current.map((execution) => execution.id === entry.id
            ? { ...execution, status: "completed", error: null, ...completion }
            : execution));
        } catch (error) {
          updateExecutions(executionsRef.current.map((execution) => execution.id === entry.id
            ? {
              ...execution,
              status: "failed",
              error: errorMessage(error),
              completion_confirmed: null,
            }
            : execution));
        }
      }
    } finally {
      runningRef.current = false;
      setIsPending(false);
    }

    return executionsRef.current;
  }, [updateExecutions]);

  return { executions, isPending, reset, run };
};
