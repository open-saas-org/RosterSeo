import crypto from "node:crypto";

export type CashfreeMode = "sandbox" | "production";

export function getCashfreeMode(): CashfreeMode {
  return process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
}

function getCashfreeBaseUrl(): string {
  return getCashfreeMode() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function getCashfreeCredentials(): { appId: string; secretKey: string } {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) {
    throw new Error(
      "CASHFREE_APP_ID and CASHFREE_SECRET_KEY must be set in hosted mode (SELF_HOSTED=false).",
    );
  }
  return { appId, secretKey };
}

async function cashfreeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { appId, secretKey } = getCashfreeCredentials();
  const res = await fetch(`${getCashfreeBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "2025-01-01",
      "x-client-id": appId,
      "x-client-secret": secretKey,
      ...(init.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof data.message === "string"
        ? data.message
        : `Cashfree API request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export type CashfreeSubscriptionResponse = {
  subscription_id: string;
  cf_subscription_id?: string;
  subscription_status: string;
  subscription_session_id?: string;
  plan_details?: {
    plan_id?: string;
  };
  customer_details?: {
    customer_id?: string;
    customer_email?: string;
  };
};

export async function createCashfreeSubscription(params: {
  subscriptionId: string;
  planId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
}): Promise<CashfreeSubscriptionResponse> {
  return cashfreeRequest<CashfreeSubscriptionResponse>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      subscription_id: params.subscriptionId,
      customer_details: {
        customer_name: params.customerName,
        customer_email: params.customerEmail,
        customer_phone: params.customerPhone,
      },
      plan_details: {
        plan_id: params.planId,
      },
      subscription_meta: {
        return_url: params.returnUrl,
      },
    }),
  });
}

export async function getCashfreeSubscription(
  subscriptionId: string,
): Promise<CashfreeSubscriptionResponse> {
  return cashfreeRequest<CashfreeSubscriptionResponse>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
  );
}

export async function cancelCashfreeSubscription(
  subscriptionId: string,
): Promise<CashfreeSubscriptionResponse> {
  return cashfreeRequest<CashfreeSubscriptionResponse>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/manage`,
    {
      method: "POST",
      body: JSON.stringify({
        subscription_id: subscriptionId,
        action: "CANCEL",
      }),
    },
  );
}

export function verifyCashfreeWebhookSignature(
  headerSignature: string,
  headerTimestamp: string,
  rawBody: string,
): boolean {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET_KEY;
  if (!secret) return false;

  const signatureData = `${headerTimestamp}${rawBody}`;
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(signatureData)
    .digest("base64");

  const a = Buffer.from(computedSignature);
  const b = Buffer.from(headerSignature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
