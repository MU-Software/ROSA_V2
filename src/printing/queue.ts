import type { OrderProductRelation } from "../domain";
import { getPaidOptionExchangeTargets } from "../domain";

export const DEFAULT_BADGE_TEMPLATE_ID = "registration.badge.default";
export const DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID = "registration.exchange-voucher.default";

export type PrintJob<TData = unknown> = {
  template_id: string;
  data: TData;
};

export type PrintQueueEntry<TData = unknown> = {
  id: string;
  job: PrintJob<TData>;
};

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
    queue.enqueue({ template_id: DEFAULT_BADGE_TEMPLATE_ID, data });
  }
  if (getPaidOptionExchangeTargets(product).length > 0) {
    queue.enqueue({ template_id: DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID, data });
  }

  return queue;
};

export const getPrintTemplateLabel = (templateId: string): string => {
  if (templateId === DEFAULT_BADGE_TEMPLATE_ID) return "명찰";
  if (templateId === DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID) return "유료 옵션 교환권";
  return templateId;
};
