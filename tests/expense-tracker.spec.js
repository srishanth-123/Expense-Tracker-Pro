const { test, expect } = require('@playwright/test');
const crypto = require('crypto');

test('Complete Expense Tracker Feature Suite', async ({ page }) => {
  test.setTimeout(60000);
  const timestamp = Date.now();
  const testUserEmail = `suite_e2e_${timestamp}@gmail.com`;
  const testUserPassword = 'Password123!';
  const testUserName = 'E2E Suite User';

  // Expose cryptographic signature generation to mock Razorpay verification natively on the backend
  await page.exposeFunction('calculateSignature', (orderId, paymentId) => {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'LpoSbYnkCbnqtRKM2OT190IH';
    const body = orderId + '|' + paymentId;
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  });

  // Mock window.Razorpay checkout window to automatically trigger verification
  await page.addInitScript(() => {
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

  // Intercept Razorpay SDK script loading to prevent overwriting our mock window.Razorpay
  await page.route('https://checkout.razorpay.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '// Mocked Razorpay SDK'
    });
  });

  // ─── 1. USER REGISTRATION & PRO UPGRADE ───
  await page.goto('/register');
  await page.fill('input[placeholder="John Doe"]', testUserName);
  await page.fill('input[placeholder="you@gmail.com"]', testUserEmail);
  await page.fill('input[placeholder="••••••••"]', testUserPassword);
  await page.click('button[type="submit"]:has-text("Sign Up")');
  
  await page.waitForURL('**/');
  await expect(page.locator('.dash-greeting')).toBeVisible();

  // Upgrade to Pro to unlock Budgets/AI
  await page.goto('/profile');
  await page.waitForURL('**/profile');
  await page.click('button:has-text("Upgrade to PRO")');
  await expect(page.locator('body')).toContainText('✦ Pro Member');

  // Top-up wallet to enable savings goals and transaction balance
  await page.click('nav a:has-text("Wallet Top-up")');
  await page.waitForURL('**/wallet');
  await page.fill('input[placeholder="Enter amount (e.g., 500)"]', '1000');
  await page.click('button[type="submit"]:has-text("Proceed to Pay")');
  await expect(page.locator('body')).toContainText('₹1,000');

  // ─── 2. CATEGORIES SEEDING & DELETION ───
  await page.goto('/transactions');
  await page.waitForURL('**/transactions');
  
  // Open Manage Categories modal
  await page.click('button:has-text("Categories")');
  
  // Add "Groceries" Category
  await page.fill('input[placeholder*="New category name"]', 'Groceries');
  await page.click('button[type="submit"]:has-text("Add")');
  await expect(page.locator('.modal-content')).toContainText('Groceries');

  // Add "Temp Category" to test deletion
  await page.fill('input[placeholder*="New category name"]', 'Temp Category');
  await page.click('button[type="submit"]:has-text("Add")');
  await expect(page.locator('.modal-content')).toContainText('Temp Category');

  // Delete "Temp Category"
  await page.locator('.modal-content span').filter({ hasText: /^Temp Category$/ }).locator('..').locator('button[title="Delete"]').click();
  await page.click('.modal-overlay button:has-text("Delete")');
  await expect(page.locator('.modal-content')).not.toContainText('Temp Category');
  
  // Add "Food" Category
  await page.fill('input[placeholder*="New category name"]', 'Food');
  await page.click('button[type="submit"]:has-text("Add")');
  
  // Close Manage Categories modal
  await page.click('.modal-content button.close-btn');

  // ─── 3. BUDGET LIMITS & OVERSPENDING WARNINGS ───
  await page.click('nav a:has-text("Budgets")');
  await page.waitForURL('**/budgets');
  
  await page.click('button:has-text("New Budget")');
  await page.selectOption('select', { label: 'Food' });
  await page.fill('input[placeholder="e.g. 10000"]', '2000');
  await page.click('button[type="submit"]:has-text("Create Budget")');
  await expect(page.locator('body')).toContainText('₹2,000');

  // Add Food transaction exceeding the ₹2000 budget to trigger warnings
  await page.goto('/transactions');
  await page.waitForURL('**/transactions');
  await page.click('button:has-text("Add New")');
  await page.fill('.modal-content input[placeholder="0.00"]', '2500');
  await page.selectOption('.modal-content select[required]', { label: 'Food' });
  await page.fill('.modal-content input[placeholder="What was this for?"]', 'Exceeding Dinner');
  await page.click('.modal-content button[type="submit"]');

  // Verify transaction is listed
  await expect(page.locator('.tx-list-container')).toContainText('Exceeding Dinner');

  // Verify Real-time Budget Overspending Notification
  await page.click('button[title="Notifications"]');
  await page.waitForURL('**/notifications');
  await expect(page.locator('body')).toContainText('exceeded by');

  // ─── 4. TRANSACTIONS SEARCH, SORT, FILTER & CSV EXPORT ───
  await page.goto('/transactions');
  await page.waitForURL('**/transactions');

  // Add another transaction for sorting/filtering
  await page.click('button:has-text("Add New")');
  await page.fill('.modal-content input[placeholder="0.00"]', '300');
  await page.selectOption('.modal-content select[required]', { label: 'Groceries' });
  await page.fill('.modal-content input[placeholder="What was this for?"]', 'E2E Milk');
  await page.click('.modal-content button[type="submit"]');
  await expect(page.locator('.tx-list-container')).toContainText('E2E Milk');

  // Test Search
  await page.fill('input[placeholder="Search descriptions..."]', 'Milk');
  await page.waitForTimeout(500); // Debounce delay
  await expect(page.locator('.tx-list-container')).toContainText('E2E Milk');
  await expect(page.locator('.tx-list-container')).not.toContainText('Exceeding Dinner');

  // Reset Search
  await page.fill('input[placeholder="Search descriptions..."]', '');
  await page.waitForTimeout(500);

  // Test Filter by Type (Expense)
  await page.selectOption('select:has-text("All Types")', 'expense');
  await expect(page.locator('.tx-list-container')).toContainText('Exceeding Dinner');

  // Test Sort by Amount descending
  await page.selectOption('select:has-text("Newest")', 'amount-desc');
  await page.waitForTimeout(500);
  await expect(page.locator('.tx-row').first()).toContainText('₹2,500');

  // Test CSV export (verify link and download trigger)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export")')
  ]);
  expect(download.suggestedFilename()).toContain('transactions_export');

  // ─── 5. RECEIPT OCR SCAN MOCK ───
  await page.route('**/api/ocr/scan', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'Receipt parsed successfully',
        data: {
          merchantName: 'E2E Mock Store',
          amount: 450,
          date: '2026-06-29',
          category: 'Groceries',
          items: [{ description: 'Mock Milk', price: 150 }]
        }
      })
    });
  });

  await page.click('button:has-text("Scan Receipt")');
  await page.setInputFiles('#ocr-file-input', {
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake-image-content')
  });

  await expect(page.locator('body')).toContainText('E2E Mock Store');
  await page.click('button:has-text("Apply & Prefill Form")');
  await expect(page.locator('.modal-content input[placeholder="0.00"]')).toHaveValue('450');
  await page.click('.modal-content button:has-text("Cancel")');

  // ─── 6. SAVINGS GOALS ───
  await page.click('nav a:has-text("Savings Goals")');
  await page.waitForURL('**/savings');
  
  await page.click('button:has-text("New Goal")');
  await page.fill('input[placeholder*="Emergency Fund"]', 'E2E Laptop Savings');
  await page.fill('input[placeholder="10000"]', '5000');
  await page.click('button[type="submit"]:has-text("Create Goal")');
  
  await expect(page.locator('body')).toContainText('E2E Laptop Savings');

  // Contribute ₹100
  await page.click('button:has-text("Add")');
  await page.fill('input[placeholder="Amount (₹)"]', '100');
  await page.click('button.btn:has-text("Add")');
  await expect(page.locator('body')).toContainText('₹100 / ₹5,000');

  // Withdraw ₹50
  await page.click('button:has-text("Withdraw")');
  await page.fill('input[placeholder="Amount (₹)"]', '50');
  await page.click('button.btn:has-text("Withdraw")');
  await expect(page.locator('body')).toContainText('₹50 / ₹5,000');

  // ─── 7. FINPILOT AI CHAT & ACTION EXECUTION ───
  let chatMsgCount = 0;
  await page.route('**/api/chatbot/message', async route => {
    chatMsgCount++;
    if (chatMsgCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            role: 'model',
            content: JSON.stringify({
              responseType: 'confirmation',
              intent: 'CREATE_TRANSACTION',
              fields: {
                amount: 1500,
                type: 'expense',
                categoryName: 'Food',
                description: 'AI Ordered Pizza'
              }
            })
          }
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            role: 'model',
            content: JSON.stringify({
              responseType: 'action_result',
              success: true,
              message: 'Successfully created Food expense of ₹1,500.',
              actionType: 'CREATE_TRANSACTION',
              data: {}
            })
          }
        })
      });
    }
  });

  await page.click('nav a:has-text("FinPilot AI")');
  await page.waitForURL('**/chat');
  await page.fill('[placeholder*="Message FinPilot"]', 'Add an expense of 1500 with description Pizza');
  await page.click('button.chat-send-btn');

  await expect(page.locator('#chat-confirm-card')).toBeVisible();
  await expect(page.locator('#chat-confirm-card')).toContainText('Pizza');
  await page.click('button:has-text("Yes, proceed")');
  
  await expect(page.locator('.result-card.success')).toBeVisible();
  await expect(page.locator('.result-card.success')).toContainText('Food');

  // ─── 8. ANALYTICS & CHARTS ───
  await page.click('nav a:has-text("Analytics")');
  await page.waitForURL('**/analytics');
  await expect(page.locator('body')).toContainText('Advanced Analytics');

  // ─── 9. ACTIVE SESSIONS & SECURITY AUDIT LOGS ───
  await page.goto('/profile');
  await page.waitForURL('**/profile');
  
  // Verify Active Sessions toggle list
  await page.click('button:has-text("Active Sessions")');
  await expect(page.locator('body')).toContainText('Current');

  // Verify Security Audit Log toggle list
  await page.click('button:has-text("Security Audit Log")');
  await expect(page.locator('body')).toContainText('New account registered');
});
