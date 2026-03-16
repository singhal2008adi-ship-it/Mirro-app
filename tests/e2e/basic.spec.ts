import { test, expect } from '@playwright/test';

test.describe('Mirro PWA Basic Flows', () => {
  test('should load onboarding and navigate to login', async ({ page }) => {
    // Should redirect to login if not authenticated
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    
    // Step 0: Upload Your Photo
    await expect(page.locator('text=Upload Your Photo')).toBeVisible();
    await page.click('button:has-text("Next")');

    // Step 1: Pick Any Style
    await expect(page.locator('text=Pick Any Style')).toBeVisible();
    await page.click('button:has-text("Next")');

    // Step 2: Smart Shopping
    await expect(page.locator('text=Smart Shopping')).toBeVisible();
    await expect(page.locator('text=Continue with Google')).toBeVisible();
  });

  test('should check API status (Gemini)', async ({ request }) => {
    // The gemini route likely requires a body, testing basic accessibility
    const response = await request.post('/api/gemini', {
      data: { text: 'Hello' }
    });
    // We expect 200 now that keys are present, or at least not 500
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
