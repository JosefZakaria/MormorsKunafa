export async function sendSms(to: string, message: string): Promise<void> {
  const projectId = process.env.SINCH_PROJECT_ID;
  const apiToken = process.env.SINCH_API_TOKEN;

  if (!projectId || !apiToken) {
    console.warn('Sinch SMS config missing, skipping SMS sending.');
    return;
  }

  // Handle phone number formatting
  let cleanedNumber = to.trim().replace(/^\+/, '');
  
  // Convert typical Swedish format starting with 0 to 46
  if (cleanedNumber.startsWith('0')) {
    cleanedNumber = '46' + cleanedNumber.substring(1);
  }
  
  // Remove any remaining spaces or hyphens
  cleanedNumber = cleanedNumber.replace(/[\s-]/g, '');

  const url = `https://sms.api.sinch.com/xms/v1/${projectId}/batches`;
  
  const body = {
    from: 'MORMORS',
    to: [cleanedNumber],
    body: message,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sinch API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
  } catch (error) {
    console.error('[SmsService] Failed to send SMS:', error);
    throw error;
  }
}
