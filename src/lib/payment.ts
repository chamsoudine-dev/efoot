/**
 * Intégration Passerelles Mobile Money — EFootLigue
 * Supporte : CinetPay (Wave, Orange Money, MTN, Moov), Mynita, Amana Transfert
 */

export type PaymentOperator = 'CINETPAY' | 'WAVE' | 'ORANGE_MONEY' | 'MTN' | 'MOOV' | 'MYNITA' | 'AMANA' | 'MANUAL';

export type PaymentInitRequest = {
  amount: number;         // Montant en FCFA
  currency?: string;      // 'XOF' par défaut
  transactionId: string;  // ID unique de transaction
  description: string;
  customerName: string;
  customerPhone: string;
  returnUrl: string;
  notifyUrl: string;
  operator?: PaymentOperator;
  metadata?: Record<string, string>;
};

export type PaymentInitResult = {
  ok: boolean;
  paymentUrl?: string;
  transactionId: string;
  provider: string;
  fallback?: 'MANUAL';
  error?: string;
};

export type PaymentStatus = {
  ok: boolean;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  amount?: number;
  transactionId?: string;
  operator?: string;
  paidAt?: string;
  error?: string;
};

const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY || '';
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID || '';

/**
 * Initie un paiement via la passerelle automatique ou prépare le mode manuel
 */
export async function initiatePayment(req: PaymentInitRequest): Promise<PaymentInitResult> {
  // Si CinetPay est configuré avec ses clés API
  if (CINETPAY_API_KEY && CINETPAY_SITE_ID) {
    try {
      const payload = {
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: req.transactionId,
        amount: req.amount,
        currency: req.currency || 'XOF',
        description: req.description,
        customer_id: req.customerPhone.replace(/\D/g, ''),
        customer_surname: req.customerName.split(' ')[0] || req.customerName,
        customer_name: req.customerName,
        customer_phone_number: req.customerPhone.replace(/\D/g, ''),
        customer_email: `${req.customerPhone.replace(/\D/g, '')}@efootligue.app`,
        notify_url: req.notifyUrl,
        return_url: req.returnUrl,
        channels: req.operator === 'WAVE' ? 'WAVE' : req.operator === 'ORANGE_MONEY' ? 'ORANGE_MONEY' : 'ALL',
        metadata: JSON.stringify(req.metadata || {}),
        lang: 'fr',
      };

      const res = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.code === '201' && data.data?.payment_url) {
        return {
          ok: true,
          paymentUrl: data.data.payment_url,
          transactionId: req.transactionId,
          provider: 'CINETPAY',
        };
      }
    } catch (err) {
      console.warn('[Payment] CinetPay indisponible, bascule en mode direct:', err);
    }
  }

  // Fallback direct Mobile Money (Amana / Mynita / Transfert Direct)
  return {
    ok: true,
    provider: req.operator || 'MANUAL',
    transactionId: req.transactionId,
    fallback: 'MANUAL',
  };
}

/**
 * Vérification du statut d'une transaction CinetPay
 */
export async function checkPaymentStatus(transactionId: string): Promise<PaymentStatus> {
  if (!CINETPAY_API_KEY || !CINETPAY_SITE_ID) {
    return { ok: true, status: 'PENDING', transactionId };
  }

  try {
    const res = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: transactionId,
      }),
    });

    const data = await res.json();
    const status = data.data?.status;

    return {
      ok: true,
      status: status === 'ACCEPTED' ? 'PAID' : status === 'REFUSED' ? 'FAILED' : 'PENDING',
      amount: data.data?.amount,
      transactionId,
      operator: data.data?.payment_method,
      paidAt: data.data?.payment_date,
    };
  } catch (err) {
    return { ok: false, status: 'PENDING', error: err instanceof Error ? err.message : 'Erreur vérification' };
  }
}

export function generateTransactionId(prefix = 'EFL'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export function calculatePotBreakdown(opts: {
  fee: number;
  paidCount: number;
  p1Pct: number;
  p2Pct: number;
  orgPct: number;
}) {
  const total = opts.fee * opts.paidCount;
  return {
    total,
    firstPrize: Math.floor((total * opts.p1Pct) / 100),
    secondPrize: Math.floor((total * opts.p2Pct) / 100),
    organizerShare: Math.floor((total * opts.orgPct) / 100),
  };
}
