const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/proxy';

const CUSTOMER_ID_STORAGE_KEY = 'ootsuki_anonymous_customer_id';
const CONSENT_STORAGE_KEY = 'ootsuki_customer_memory_consent';

export interface CustomerMemoryIdentity {
  anonymous_customer_id: string;
  consent_status: string;
  visit_count: number;
}

export function getStoredCustomerMemoryConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(CONSENT_STORAGE_KEY) === 'accepted';
}

export function setStoredCustomerMemoryConsent(accepted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, accepted ? 'accepted' : 'unknown');
}

export async function resolveCustomerMemoryIdentity(): Promise<CustomerMemoryIdentity> {
  const storedId =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(CUSTOMER_ID_STORAGE_KEY)
      : null;
  const consentAccepted = getStoredCustomerMemoryConsent();

  const response = await fetch(`${API_BASE}/customer-memory/identify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      anonymous_customer_id: storedId,
      consent_accepted: consentAccepted,
      source: 'chat_window',
    }),
  });

  if (!response.ok) {
    throw new Error(`customer memory identify failed: ${response.status}`);
  }

  const identity = (await response.json()) as CustomerMemoryIdentity;
  if (typeof window !== 'undefined' && identity.anonymous_customer_id) {
    window.localStorage.setItem(
      CUSTOMER_ID_STORAGE_KEY,
      identity.anonymous_customer_id
    );
  }
  return identity;
}
