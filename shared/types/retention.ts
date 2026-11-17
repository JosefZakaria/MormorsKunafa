export const RETENTION_FIELD_LABELS = {
  contact: 'Telefon och e-post',
  delivery_contact: 'Telefon och e-post i leveransuppgifterna',
  identity_address: 'Namn och leveransadress',
  notes: 'Interna anteckningar',
  purchase_details: 'Order, orderrader och produktanpassningar',
  payment_details: 'Betalningsuppgifter och avbeställningsunderlag',
} as const;
export type RetentionField = keyof typeof RETENTION_FIELD_LABELS;
export const ERASABLE_RETENTION_FIELDS: RetentionField[] = ['contact', 'delivery_contact', 'identity_address', 'notes'];
export const RETENTION_REASON_LABELS = {
  payment: 'Betalning eller återbetalning utreds',
  complaint: 'Pågående reklamation',
  dispute: 'Tvist eller rättsligt anspråk',
  restriction: 'Begäran om begränsning av behandling',
} as const;
export type RetentionHoldReason = keyof typeof RETENTION_REASON_LABELS;
export interface RetentionHold {
  id: string;
  orderId: string;
  fields: RetentionField[];
  reason: RetentionHoldReason;
  responsibleName: string;
  reviewOn: string;
  createdAt: string;
  releasedAt: string | null;
}
export interface RetentionHoldInput {
  fields: RetentionField[];
  reason: RetentionHoldReason;
  reviewOn: string;
}
export interface RetentionDecision {
  field: RetentionField;
  status: 'preserve' | 'candidate' | 'waiting' | 'hold' | 'review';
  rule: string;
  reason: string;
  eligibleFrom?: string;
}
export interface RetentionOrderPreview {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string | null;
  holds: RetentionHold[];
  decisions: RetentionDecision[];
  version: string;
}
export interface RetentionPreview {
  readOnly: true;
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  warning?: string;
  orders: RetentionOrderPreview[];
}
export interface RetentionErasureInput {
  fields: RetentionField[];
  version: string;
  confirmedNoAccountingNeed: boolean;
  closedOn?: string;
  notesOperationalOnly?: boolean;
  purposeEnded?: boolean;
}
export interface RetentionErasureResult {
  runId: string;
  orderId: string;
  fields: RetentionField[];
  performedAt: string;
}
