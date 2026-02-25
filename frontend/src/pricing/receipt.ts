export const LAST_ORDER_RECEIPT_KEY = "lastOrderReceipt";

export type OrderReceiptLine = {
  menu_item_id: number;
  name: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
};

export type OrderReceipt = {
  lines: OrderReceiptLine[];
  subtotal_cents: number;
  tax_rate_percent: number;
  tax_cents: number;
  tip_mode: "none" | "preset" | "custom";
  tip_percent: number | null;
  tip_cents: number;
  grand_total_cents: number;
  created_at_iso: string;
};
