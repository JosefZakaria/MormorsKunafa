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

  const url = `https://us.conversation.api.sinch.com/v1/projects/${projectId}/messages:send`;
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sinch API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const responseData = await response.text();
    console.log("[SmsService] Sinch-svar:", responseData);
  } catch (error) {
    console.error('[SmsService] Failed to send SMS:', error);
    throw error;
  }
}
