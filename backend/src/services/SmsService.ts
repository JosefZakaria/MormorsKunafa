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

export async function sendSms(to: string, message: string): Promise<void> {
  const projectId = process.env.SINCH_PROJECT_ID?.trim();
  const keyId = process.env.SINCH_KEY_ID?.trim();
  const keySecret = process.env.SINCH_KEY_SECRET?.trim();
  const appId = process.env.SINCH_APP_ID?.trim();

  if (!projectId || !keyId || !keySecret || !appId) {
    console.warn('Sinch Conversation API config missing, skipping SMS sending.');
    return;
  }

  // Konvertera telefonnummer: 073... blir +4673...
  let cleanedNumber = to.trim().replace(/^\+/, '');
  if (cleanedNumber.startsWith('0')) {
    cleanedNumber = '46' + cleanedNumber.substring(1);
  }
  cleanedNumber = cleanedNumber.replace(/[\s-]/g, '');
  const formattedNumber = '+' + cleanedNumber;

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
      throw new Error(`Sinch SMS request failed with status ${response.status}`);
    }
  } catch (error) {
    console.error('[SmsService] Failed to send SMS:', error);
    throw error;
  }
}
