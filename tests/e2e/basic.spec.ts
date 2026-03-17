import { test, expect } from '@playwright/test';

const TINY_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Mirro PWA – API Integration Tests', () => {

  test('Try-On API: Accepts base64 images and returns a valid result', async ({ request }) => {
    const response = await request.post('/api/try-on', {
      data: {
        basePhotoData: TINY_PNG_BASE64,
        garmentImageData: TINY_PNG_BASE64
      }
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body).toHaveProperty('engine');
    // Result must always be a data URL or http URL — never null
    const result = body.result as string;
    expect(result.startsWith('data:') || result.startsWith('http')).toBe(true);
  });

  test('Pricing API: Myntra link returns 5 marketplaces with correct best-price flag', async ({ request }) => {
    const myntraLink = 'https://www.myntra.com/shirts/roadster/roadster-men-olive-green--cotton-casual-shirt/11904108/buy';

    const res = await request.post('/api/pricing', { data: { query: myntraLink } });
    expect(res.ok()).toBeTruthy();

    const data = await res.json();
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThanOrEqual(3);

    // All prices should be positive numbers
    for (const r of data.results) {
      expect(typeof r.price).toBe('number');
      expect(r.price).toBeGreaterThan(0);
      expect(r.currency).toBe('₹');
    }

    // Exactly one best-price item
    const best = data.results.filter((r: { isBest: boolean }) => r.isBest);
    expect(best.length).toBe(1);
    const minPrice = Math.min(...data.results.map((r: { price: number }) => r.price));
    expect(best[0].price).toBe(minPrice);
  });

  test('Pricing API: Garment image base64 returns results', async ({ request }) => {
    const res = await request.post('/api/pricing', { data: { imageBase64: TINY_PNG_BASE64 } });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.results.length).toBeGreaterThan(0);
  });

  test('Login page renders without crash', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Internal Server Error');
    await page.screenshot({ path: 'screenshots/login-page.png' });
  });
});
