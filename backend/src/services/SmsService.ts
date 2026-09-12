import { OutboundDeliveryError } from './outboundDeliveryError.js';

const SINCH_REGION_HOSTS = {
  eu: 'https://eu.conversation.api.sinch.com',
  us: 'https://us.conversation.api.sinch.com',
  br: 'https://br.conversation.api.sinch.com',
} as const;

export function getSinchConversationApiBaseUrl(regionValue?: string): string {
  const region = String(regionValue ?? 'eu').trim().toLowerCase();
  if (!(region in SINCH_REGION_HOSTS)) {
    throw new Error('SINCH_REGION must be one of: eu, us, br');
  }
  return SINCH_REGION_HOSTS[region as keyof typeof SINCH_REGION_HOSTS];
}

export function classifySinchHttpFailure(status: number): OutboundDeliveryError {
  if (status === 429) {
    return new OutboundDeliveryError('retryable', 'provider_rate_limited', status);
  }
  if (status >= 500 || status === 408) {
    // The provider might have accepted the message before returning/losing the
    // response, and this API call has no verified client idempotency contract.
    return new OutboundDeliveryError('uncertain', 'provider_response_uncertain', status);
  }
  return new OutboundDeliveryError('permanent', 'provider_rejected', status);
}

export async function sendSms(
  to: string,
  message: string
): Promise<{ providerMessageId?: string }> {
  const projectId = process.env.SINCH_PROJECT_ID?.trim();
  const keyId = process.env.SINCH_KEY_ID?.trim();
  const keySecret = process.env.SINCH_KEY_SECRET?.trim();
  const appId = process.env.SINCH_APP_ID?.trim();

  if (!projectId || !keyId || !keySecret || !appId) {
    throw new OutboundDeliveryError('permanent', 'provider_not_configured');
  }

  // Konvertera telefonnummer: 073... blir +4673...
  let cleanedNumber = to.trim().replace(/^\+/, '');
  if (cleanedNumber.startsWith('0')) {
    cleanedNumber = '46' + cleanedNumber.substring(1);
  }
  cleanedNumber = cleanedNumber.replace(/[\s-]/g, '');
  const formattedNumber = '+' + cleanedNumber;
  if (!/^\+[1-9][0-9]{6,14}$/.test(formattedNumber)) {
    throw new OutboundDeliveryError('permanent', 'invalid_recipient');
  }

  const baseUrl = getSinchConversationApiBaseUrl(process.env.SINCH_REGION);
  const url = `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
  const authString = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const body = {
    app_id: appId,
    recipient: {
      identified_by: {
        channel_identities: [
          {
            channel: "SMS",
            identity: formattedNumber
          }
        ]
      }
    },
    message: {
      text_message: {
        text: message
      }
    },
    channel_properties: {
      SMS_SENDER: "Mormor"
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw classifySinchHttpFailure(response.status);
    }
    const responseBody = await response.json().catch(() => null) as Record<string, unknown> | null;
    const providerMessageId = String(responseBody?.message_id ?? responseBody?.id ?? '').trim();
    return providerMessageId && providerMessageId.length <= 255 ? { providerMessageId } : {};
  } catch (error) {
    if (error instanceof OutboundDeliveryError) throw error;
    // Timeout/network failures are never auto-retried for Sinch because the
    // provider may already have accepted the request.
    throw new OutboundDeliveryError('uncertain', 'provider_response_uncertain');
  }
}
