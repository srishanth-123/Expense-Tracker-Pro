const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Helper to poll Winston combined.log for verification links
async function getVerifyLinkFromLog(email, timeoutMs = 8000) {
  const logPath = path.resolve(__dirname, '../backend/logs/combined.log');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('[MAILER] Verification Link for') && lines[i].includes(email)) {
          const match = lines[i].match(/(http:\/\/localhost(:\d+)?\/verify-email\/[a-zA-Z0-9]+)/);
          if (match) return match[1];
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for verification link for ${email}`);
}

test('Multi-User Wallet Transfers, Requests, and Split Settlement', async ({ browser }) => {
  test.setTimeout(60000);
  const timestamp = Date.now();
  const emailA = `usera_${timestamp}@gmail.com`;
  const emailB = `userb_${timestamp}@gmail.com`;
  const pass = 'Password123!';
  const nameA = 'User A';
  const nameB = 'User B';

  // ─── CONTEXT & PAGE CREATION ───
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  // Expose Razorpay signature generator to User A's page
  await pageA.exposeFunction('calculateSignature', (orderId, paymentId) => {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'LpoSbYnkCbnqtRKM2OT190IH';
    const body = orderId + '|' + paymentId;
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  });

  // Mock Razorpay script loading for User A
  await pageA.route('https://checkout.razorpay.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '// Mocked Razorpay SDK'
    });
  });

  // Mock window.Razorpay constructor for User A
  await pageA.addInitScript(() => {
    window.Razorpay = class {
      constructor(options) {
        this.options = options;
      }
      on(event, callback) {}
      async open() {
        const paymentId = `pay_mock_${Date.now()}`;
        const signature = await window.calculateSignature(this.options.order_id, paymentId);
        if (this.options.handler) {
          await this.options.handler({
            razorpay_order_id: this.options.order_id,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature
          });
        }
      }
    };
  });

  // ─── 1. REGISTER USER A ───
  await pageA.goto('/register');
  await pageA.fill('input[placeholder="John Doe"]', nameA);
  await pageA.fill('input[placeholder="you@gmail.com"]', emailA);
  await pageA.fill('input[placeholder="••••••••"]', pass);
  await pageA.click('button[type="submit"]:has-text("Sign Up")');
  await pageA.waitForURL('**/');

  // Verify email A
  const linkA = await getVerifyLinkFromLog(emailA);
  await pageA.goto(new URL(linkA).pathname);
  await expect(pageA.locator('h1')).toContainText('Email Verified!');

  // ─── 2. REGISTER USER B ───
  await pageB.goto('/register');
  await pageB.fill('input[placeholder="John Doe"]', nameB);
  await pageB.fill('input[placeholder="you@gmail.com"]', emailB);
  await pageB.fill('input[placeholder="••••••••"]', pass);
  await pageB.click('button[type="submit"]:has-text("Sign Up")');
  await pageB.waitForURL('**/');

  // Verify email B
  const linkB = await getVerifyLinkFromLog(emailB);
  await pageB.goto(new URL(linkB).pathname);
  await expect(pageB.locator('h1')).toContainText('Email Verified!');

  // ─── 3. USER A UPGRADES TO PRO & TOPS UP WALLET ───
  await pageA.goto('/profile');
  await pageA.waitForURL('**/profile');
  await pageA.click('button:has-text("Upgrade to PRO")');
  await expect(pageA.locator('body')).toContainText('✦ Pro Member');

  await pageA.click('nav a:has-text("Wallet Top-up")');
  await pageA.waitForURL('**/wallet');
  await pageA.fill('input[placeholder="Enter amount (e.g., 500)"]', '1000');
  await pageA.click('button[type="submit"]:has-text("Proceed to Pay")');
  await expect(pageA.locator('body')).toContainText('₹1,000');

  // ─── 4. USER A TRANSFERS ₹300 TO USER B ───
  await pageA.click('button:has-text("Send")');
  await pageA.fill('input[placeholder="Search by email or name..."]', emailB);
  await pageA.click(`div[style*="position: absolute"] div:has-text("${emailB}")`);
  await pageA.fill('input[placeholder="Enter amount"]', '300');
  await pageA.fill('input[placeholder="What\'s this for?"]', 'Gift for B');
  await pageA.click('button:has-text("Send Money securely")');
  await pageA.click('.modal-content button:has-text("Send")');
  await expect(pageA.locator('body')).toContainText('₹700');

  // ─── 5. USER B VERIFIES WALLET BALANCE ───
  await pageB.goto('/wallet');
  await pageB.waitForURL('**/wallet');
  await expect(pageB.locator('body')).toContainText('₹300');

  // ─── 6. USER B REQUESTS ₹100 FROM USER A ───
  await pageB.click('button:has-text("Requests")');
  await pageB.click('button:has-text("New Request")');
  await pageB.fill('input[placeholder="Search by email or name..."]', emailA);
  await pageB.click(`div[style*="position: absolute"] div:has-text("${emailA}")`);
  await pageB.fill('input[placeholder="Enter amount"]', '100');
  await pageB.fill('input[placeholder="e.g. Dinner share"]', 'Request for cab share');
  await pageB.click('button:has-text("Send Request")');
  await pageB.click('.modal-content button:has-text("Send Request")');
  await expect(pageB.locator('body')).toContainText('Money request sent');

  // ─── 7. USER A ACCEPTS REQUEST ───
  await pageA.goto('/wallet');
  await pageA.click('button:has-text("Requests")');
  await pageA.click('button:has-text("Inbox")');
  await pageA.click('button:has-text("Pay ₹100")');
  await expect(pageA.locator('body')).toContainText('Request accepted');
  await expect(pageA.locator('body')).toContainText('₹600');

  // User B checks balance
  await pageB.goto('/wallet');
  await expect(pageB.locator('body')).toContainText('₹400');

  // ─── 8. USER A CREATES SPLIT BILL WITH USER B ───
  // Create a category for User A via the UI first so the select dropdown has options
  await pageA.goto('/transactions');
  await pageA.waitForURL('**/transactions');
  await pageA.click('button:has-text("Categories")');
  await pageA.fill('.modal-content input[placeholder*="New category name"]', 'Food');
  await pageA.click('.modal-content button[type="submit"]:has-text("Add")');
  await expect(pageA.locator('.modal-content')).toContainText('Food');
  await pageA.click('.modal-content button.close-btn');

  await pageA.goto('/splits');
  await pageA.waitForURL('**/splits');
  await pageA.click('button:has-text("New Split")');
  await pageA.fill('input[placeholder="Dinner, Cab, Movie..."]', 'Cab Bill Split');
  await pageA.fill('input[placeholder="Total bill amount"]', '300');
  
  // Choose category (select first available category option)
  const catSelector = await pageA.locator('.modal-content select').first();
  await catSelector.selectOption({ index: 1 });

  // Search User B
  await pageA.fill('input[placeholder="Search friend by name or email..."]', emailB);
  await pageA.click('.sp-search-results >> text=' + nameB);
  await pageA.click('.modal-content button[type="submit"]');

  await expect(pageA.locator('body')).toContainText('Cab Bill Split');

  // ─── 9. USER B SETTLES SPLIT BILL ───
  await pageB.goto('/splits');
  await pageB.waitForURL('**/splits');
  await expect(pageB.locator('body')).toContainText('Cab Bill Split');
  await pageB.click('button:has-text("Settle ₹150")');
  await pageB.click('.modal-content button:has-text("Confirm")');

  // Verify settled state in user B splits list
  await expect(pageB.locator('body')).toContainText('Settled History');
});
