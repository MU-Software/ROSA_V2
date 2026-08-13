import type { OrderProductRelation } from "../domain";
import { getPaidOptionExchangeTargets } from "../domain";
import {
  DEFAULT_BADGE_TEMPLATE,
  findBuiltInBadgeTemplate,
  selectBadgeTemplate,
} from "./templates";

export const DEFAULT_BADGE_TEMPLATE_ID = DEFAULT_BADGE_TEMPLATE.template_id;
export const DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID = "registration.exchange-voucher.default";

export type PrintJob<TData = unknown> = {
  template_id: string;
  data: TData;
};

export type PrintQueueEntry<TData = unknown> = {
  id: string;
  job: PrintJob<TData>;
};

export type PrintJobExecutionStatus = "waiting" | "printing" | "completed" | "failed";

export type PrintJobExecution = {
  id: string;
  template_id: string;
  status: PrintJobExecutionStatus;
  error: string | null;
  completion_confirmed: boolean | null;
};

export type PrintJobCompletion = {
  completion_confirmed: boolean;
};

export type PrintJobExecutor<TData = unknown> = (
  entry: PrintQueueEntry<TData>,
) => Promise<PrintJobCompletion>;

export class PrintQueue<TData = unknown> {
  private readonly entries: PrintQueueEntry<TData>[] = [];
  private sequence = 0;

  enqueue(job: PrintJob<TData>): PrintQueueEntry<TData> {
    const entry = { id: `${job.template_id}:${this.sequence++}`, job };
    this.entries.push(entry);
    return entry;
  }

  dequeue(): PrintQueueEntry<TData> | undefined {
    return this.entries.shift();
  }

  snapshot(): readonly PrintQueueEntry<TData>[] {
    return [...this.entries];
  }
}

export type RegistrationPrintData = {
  order_product_relation: OrderProductRelation;
};

export const createRegistrationPrintQueue = (
  product: OrderProductRelation,
): PrintQueue<RegistrationPrintData> => {
  const queue = new PrintQueue<RegistrationPrintData>();
  const data = { order_product_relation: product };

  if (product.is_ticket && product.ticket_info) {
    queue.enqueue({ template_id: selectBadgeTemplate(product).template_id, data });
  }
  if (getPaidOptionExchangeTargets(product).length > 0) {
    queue.enqueue({ template_id: DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID, data });
  }

  return queue;
};

export const getPrintTemplateLabel = (templateId: string): string => {
  const badgeTemplate = findBuiltInBadgeTemplate(templateId);
  if (badgeTemplate) return `${badgeTemplate.role_label} 명찰`;
  if (templateId === DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID) return "유료 옵션 교환권";
  return templateId;
};
