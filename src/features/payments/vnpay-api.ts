import { z } from 'zod';
import { request } from '../../shared/api/client';

export const vnpayCheckoutResponseSchema = z.object({
  paymentUrl: z.string().url(),
  txnRef: z.string(),
  amountVnd: z.number().or(z.string()),
});

export const vnpayTransactionViewSchema = z.object({
  txnRef: z.string(),
  orderId: z.number(),
  direction: z.string(),
  status: z.string(),
  amountUsd: z.number().or(z.string()),
  amountVnd: z.number().or(z.string()),
  stage: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable().optional(),
  providerCode: z.string().nullable().optional(),
});

export type VNPayCheckoutResponse = z.infer<typeof vnpayCheckoutResponseSchema>;
export type VNPayTransactionView = z.infer<typeof vnpayTransactionViewSchema>;

export const vnpayApi = {
  checkout: (orderId: number, amountUsd: number, stage: 'DEPOSIT' | 'FINAL_BALANCE' = 'DEPOSIT') =>
    request('/api/v1/payments/vnpay/checkout', vnpayCheckoutResponseSchema, {
      method: 'POST',
      body: { orderId, amountUsd, stage },
    }),
  transactions: (orderId: number) =>
    request(
      `/api/v1/payments/vnpay/transactions?orderId=${orderId}`,
      z.array(vnpayTransactionViewSchema),
    ),
};
