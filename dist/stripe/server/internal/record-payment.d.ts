/**
 * Records a crypto payment as a Stripe PaymentIntent using transaction_verification mode.
 * Fire-and-forget: errors are logged but never thrown.
 */
export declare function recordCryptoPayment(parameters: {
    secretKey: string;
    method: string;
    reference: string;
    amount: string;
}): void;
//# sourceMappingURL=record-payment.d.ts.map