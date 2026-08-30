const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/proxy';

const PHONE_STORAGE_KEY = 'ootsuki_customer_phone';
const NAME_STORAGE_KEY = 'ootsuki_customer_name';

export interface CustomerLoginResult {
  phone_number: string;
  name: string;
  visit_count: number;
  is_new_customer: boolean;
  favorite_menu: string;
  dislikes_allergies: string;
  preference_notes: string;
}

export function getStoredCustomerLogin(): { phone: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  const phone = window.localStorage.getItem(PHONE_STORAGE_KEY);
  const name = window.localStorage.getItem(NAME_STORAGE_KEY);
  if (!phone || !name) return null;
  return { phone, name };
}

export function clearStoredCustomerLogin(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PHONE_STORAGE_KEY);
  window.localStorage.removeItem(NAME_STORAGE_KEY);
}

export async function loginCustomer(
  phoneNumber: string,
  name: string
): Promise<CustomerLoginResult> {
  const response = await fetch(`${API_BASE}/customer/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      name,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `customer login failed: ${response.status}`);
  }

  const result = (await response.json()) as CustomerLoginResult;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PHONE_STORAGE_KEY, result.phone_number);
    window.localStorage.setItem(NAME_STORAGE_KEY, result.name);
  }
  return result;
}
