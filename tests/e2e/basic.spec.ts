import { test, expect } from '@playwright/test';

test.describe('Mirro PWA Basic Flows', () => {
  test('should load onboarding and navigate to login', async ({ page }) => {
    // Should redirect to login if not authenticated
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    
    // Step 0: Upload Your Photo
    await expect(page.locator('text=Upload Your Photo')).toBeVisible();
    
    // Capture screenshot of the first onboarding screen
    await page.screenshot({ path: 'screenshots/onboarding-step-0.png' });
    
    await page.click('button:has-text("Next")');

    // Step 1: Pick Any Style
    await expect(page.locator('text=Pick Any Style')).toBeVisible();
    await page.click('button:has-text("Next")');

    // Step 2: Smart Shopping
    await expect(page.locator('text=Smart Shopping')).toBeVisible();
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    
    // Capture screenshot of the final onboarding screen
    await page.screenshot({ path: 'screenshots/login-screen.png' });
  });

  test('should check API status (Gemini)', async ({ request }) => {
    const response = await request.post('/api/gemini', {
      data: { text: 'Hello' }
    });
    expect(response.status()).toBeLessThan(500);
  });

  test('should check API status (Try-On)', async ({ request }) => {
    const response = await request.post('/api/try-on', {
      data: {
        basePhotoUrl: 'test-base.jpg',
        targetImageUrl: 'test-target.jpg'
      }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('result');
  });
});
