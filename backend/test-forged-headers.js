require("dotenv/config");

const fs = require('fs');

async function run() {
  let success = false;
  try {
    // 1. Log in as staff1@firm1.com
    const loginRes = await fetch(`${process.env.INTEGRATION_BASE_URL || 'http://localhost:8101/api/v1'}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff1@firm1.com', password: 'password123' })
    });

    const loginData = await loginRes.json();
    const cookieHeader = loginRes.headers.get('set-cookie');

    // 2. Fetch auth/me to get firm ID
    const meRes = await fetch(`${process.env.INTEGRATION_BASE_URL || 'http://localhost:8101/api/v1'}/auth/me`, {
      headers: { 'Cookie': cookieHeader }
    });
    const meData = await meRes.json();
    const firmId = meData.data.firms[0].firmId;

    // 3. Send forged headers to a protected firm write endpoint
    const testRes = await fetch(`${process.env.INTEGRATION_BASE_URL || 'http://localhost:8101/api/v1'}/firm/settings`, {
      method: 'PATCH',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/json',
        'X-Firm-Id': firmId.toString(),
        'X-Platform-Admin': 'true',
        'X-Role': 'FIRM_OWNER',
        'X-Firm-Role': 'FIRM_OWNER'
      },
      body: JSON.stringify({ name: 'Hacked Firm Name' })
    });

    console.log(`Status: ${testRes.status}`);
    const data = await testRes.json();
    console.log(data);

    if (testRes.status === 403) {
      console.log('FORGED HEADER TEST: PASS (Denied as expected)');
      success = true;
    } else {
      console.log('FORGED HEADER TEST: FAIL (Did not receive 403)');
    }
  } catch (err) {
    console.error(err);
  }
  process.exit(success ? 0 : 1);
}

run();
