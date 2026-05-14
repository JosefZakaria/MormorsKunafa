import 'dotenv/config';
import { sendSms } from '../services/SmsService.js';

async function runTest() {
  const projectId = process.env.SINCH_PROJECT_ID || '';
  const keyId = process.env.SINCH_KEY_ID || '';
  const appId = process.env.SINCH_APP_ID || '';

  console.log("=== ENV DEBUG ===");
  console.log("Project ID:", projectId ? projectId.substring(0, 4) + '...' + projectId.substring(projectId.length - 4) : "SAKNAS");
  console.log("Key ID:", keyId ? keyId.substring(0, 4) + '...' + keyId.substring(keyId.length - 4) : "SAKNAS");
  console.log("App ID:", appId ? appId.substring(0, 4) + '...' + appId.substring(appId.length - 4) : "SAKNAS");
  console.log("=================\n");

  // ⚠️ ÄNDRA TILL DET NUMMER DU VERIFIERAT I SINCH DASHBOARD:
  const testPhoneNumber = "0739790485";
  const testMessage = "Detta är ett test-SMS från Mormors Kunafa backend!";

  console.log(`Skickar test-SMS till ${testPhoneNumber}...`);

  try {
    await sendSms(testPhoneNumber, testMessage);
    console.log("✅ SMS skickades utan fel till Sinch!");
  } catch (error) {
    console.error("❌ Ett fel uppstod vid SMS-utskick:", error);
  }
}

runTest();
