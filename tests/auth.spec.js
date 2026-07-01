const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper to poll Winston combined.log for verification/reset links
async function getLinkFromLog(email, type, timeoutMs = 8000) {
  const logPath = path.resolve(__dirname, '../backend/logs/combined.log');
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n');
      
      const searchStr = type === 'verify' 
        ? '[MAILER] Verification Link for' 
        : '[MAILER] Password Reset Link for';
        
      const regex = type === 'verify'
        ? /(http:\/\/localhost(:\d+)?\/verify-email\/[a-zA-Z0-9]+)/
        : /(http:\/\/localhost(:\d+)?\/reset-password\/[a-zA-Z0-9]+)/;

      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes(searchStr) && lines[i].includes(email)) {
          const match = lines[i].match(regex);
          if (match) return match[1];
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for ${type} link in logs for ${email}`);
}

test.describe('Authentication and Security E2E Flow', () => {
  const timestamp = Date.now();
  const testUserEmail = `auth_e2e_${timestamp}@gmail.com`;
  const testUserPassword = 'Password123!';
  const testUserName = 'Auth E2E User';
  const newPassword = 'NewPassword123!';

  test('User Register, Verify Email, Logout, Login, Reset Password', async ({ page }) => {
    test.setTimeout(60000);
    // ─── 1. USER REGISTRATION ───
    await page.goto('/register');
    await page.fill('input[placeholder="John Doe"]', testUserName);
    await page.fill('input[placeholder="you@gmail.com"]', testUserEmail);
    await page.fill('input[placeholder="••••••••"]', testUserPassword);
    await page.click('button[type="submit"]:has-text("Sign Up")');

    await page.waitForURL('**/');
    await expect(page.locator('.dash-greeting')).toBeVisible();

    // Verify unverified banner is displayed on Profile page
    await page.goto('/profile');
    await expect(page.locator('body')).toContainText('Please verify your email address');

    // ─── 2. EMAIL VERIFICATION ───
    const verifyLink = await getLinkFromLog(testUserEmail, 'verify');
    
    // Visit the email verification page
    const verifyUrl = new URL(verifyLink);
    await page.goto(verifyUrl.pathname);
    await expect(page.locator('h1')).toContainText('Email Verified!');
    await expect(page.locator('body')).toContainText('Email verified successfully');

    // ─── 3. LOGOUT AND LOGIN ───
    await page.goto('/profile');
    await page.waitForURL('**/profile');
    
    // Check Email verified status on profile
    await expect(page.locator('body')).toContainText('Verified');

    // Log out
    await page.click('button:has-text("Security Audit Log")');
    await page.click('.navbar-profile-trigger');
    await page.click('button:has-text("Logout")');
    await page.click('.modal-content button:has-text("Logout")');
    await page.waitForURL('**/login');
    await expect(page.locator('h1')).toContainText('Welcome Back');

    // Login back in
    await page.fill('input[placeholder="you@gmail.com"]', testUserEmail);
    await page.fill('input[placeholder="••••••••"]', testUserPassword);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForURL('**/');
    await expect(page.locator('.dash-greeting')).toBeVisible();

    // ─── 4. PASSWORD RESET FLOW ───
    await page.goto('/profile');
    await page.click('.navbar-profile-trigger');
    await page.click('button:has-text("Logout")');
    await page.click('.modal-content button:has-text("Logout")');
    await page.waitForURL('**/login');

    // Go to Forgot Password
    await page.click('a:has-text("Forgot Password?")');
    await page.waitForURL('**/forgot-password');
    await page.fill('input[type="email"]', testUserEmail);
    await page.click('button[type="submit"]:has-text("Send Reset Link")');
    await expect(page.locator('body')).toContainText('reset link has been sent');

    // Get reset password link from combined.log
    const resetLink = await getLinkFromLog(testUserEmail, 'reset');
    const resetUrl = new URL(resetLink);
    
    // Navigate to reset link
    await page.goto(resetUrl.pathname);
    await page.fill('input[type="password"] >> nth=0', newPassword);
    await page.fill('input[type="password"] >> nth=1', newPassword);
    await page.click('button[type="submit"]:has-text("Reset Password")');
    
    await expect(page.locator('body')).toContainText('Password reset successful');

    // Login with new password
    await page.goto('/login');
    await page.fill('input[placeholder="you@gmail.com"]', testUserEmail);
    await page.fill('input[placeholder="••••••••"]', newPassword);
    await page.click('button[type="submit"]:has-text("Sign In")');
    
    await page.waitForURL('**/');
    await expect(page.locator('.dash-greeting')).toBeVisible();
  });
});
