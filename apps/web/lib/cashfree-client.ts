"use client";

type CashfreeInstance = {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal";
  }) => Promise<{ error?: { message?: string }; redirect?: boolean }>;
};

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => CashfreeInstance;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadCashfreeSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cashfree checkout can only run in the browser."));
  }
  if (window.Cashfree) {
    return Promise.resolve();
  }
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error("Failed to load Cashfree checkout SDK."));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

export async function openCashfreeSubscriptionCheckout(
  subscriptionSessionId: string,
  mode: "sandbox" | "production",
): Promise<void> {
  await loadCashfreeSdk();
  if (!window.Cashfree) {
    throw new Error("Cashfree SDK failed to initialize.");
  }
  const cashfree = window.Cashfree({ mode });
  const result = await cashfree.checkout({
    paymentSessionId: subscriptionSessionId,
    redirectTarget: "_self",
  });
  if (result?.error?.message) {
    throw new Error(result.error.message);
  }
}
