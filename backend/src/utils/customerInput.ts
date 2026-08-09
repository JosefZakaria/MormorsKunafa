const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class CustomerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerInputError';
  }
}

function safeText(value: unknown, field: string, maximumLength: number, required = false): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
  if (required && !text) throw new CustomerInputError(`${field} krävs.`);
  if (text.length > maximumLength) {
    throw new CustomerInputError(`${field} får innehålla högst ${maximumLength} tecken.`);
  }
  if (UNSAFE_CONTROL_CHARACTERS.test(text)) {
    throw new CustomerInputError(`${field} innehåller otillåtna kontrolltecken.`);
  }
  return text;
}

function safePhone(value: unknown): string {
  const phone = safeText(value, 'Telefonnummer', 32, true);
  if (!/^[+()\d .-]+$/u.test(phone)) {
    throw new CustomerInputError('Telefonnumret innehåller ogiltiga tecken.');
  }
  const digits = phone.replace(/\D/gu, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new CustomerInputError('Telefonnumret måste innehålla 7–15 siffror.');
  }
  return phone;
}

function safeEmail(value: unknown): string | null {
  const email = safeText(value, 'E-postadress', 254).toLowerCase();
  if (!email) return null;
  if (!EMAIL_PATTERN.test(email)) throw new CustomerInputError('E-postadressen är ogiltig.');
  return email;
}

export type ValidatedCustomerInput = {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryInfo: { address: string; postalCode: string; city: string } | null;
};

export function validateCustomerInput(
  customerInfo: unknown,
  deliveryInfo: unknown,
  isDelivery: boolean
): ValidatedCustomerInput {
  const customer = customerInfo && typeof customerInfo === 'object'
    ? customerInfo as Record<string, unknown>
    : {};
  const delivery = deliveryInfo && typeof deliveryInfo === 'object'
    ? deliveryInfo as Record<string, unknown>
    : {};

  const customerName = safeText(customer.name ?? delivery.name, 'Namn', 100, true);
  const customerPhone = safePhone(customer.phone ?? delivery.phone);
  const customerEmail = safeEmail(customer.email ?? delivery.email);

  if (!isDelivery) {
    return { customerName, customerPhone, customerEmail, deliveryInfo: null };
  }

  return {
    customerName,
    customerPhone,
    customerEmail,
    // Contact fields are intentionally not duplicated in delivery_info_json.
    deliveryInfo: {
      address: safeText(delivery.address, 'Leveransadress', 200, true),
      postalCode: safeText(delivery.postalCode, 'Postnummer', 12, true),
      city: safeText(delivery.city, 'Ort', 100, true),
    },
  };
}

export function sanitizeOperationalText(value: unknown, field: string, maximumLength: number): string {
  return safeText(value, field, maximumLength);
}
