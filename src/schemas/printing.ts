import { z } from "zod";

export const PRINT_JOB_EXECUTION_STATUSES = [
  "waiting",
  "printing",
  "completed",
  "failed",
] as const;

export const printJobExecutionSchema = z.object({
  id: z.string(),
  template_id: z.string(),
  status: z.enum(PRINT_JOB_EXECUTION_STATUSES),
  error: z.string().nullable(),
  completion_confirmed: z.boolean().nullable(),
});

export type PrintJobExecutionStatus = typeof PRINT_JOB_EXECUTION_STATUSES[number];
export type PrintJobExecution = z.infer<typeof printJobExecutionSchema>;
