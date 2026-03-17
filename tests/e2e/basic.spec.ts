import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Helper: convert a local test image to base64 data URL
function localImageToBase64(relativePath: string, mimeType = 'image/jpeg'): string {
  const absPath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(absPath)) {
    const data = fs.readFileSync(absPath).toString('base64');
    return `data:${mimeType};base64,${data}`;
  }
  // Fallback: tiny 1x1 transparent PNG in base64
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

const TINY_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Mirro PWA – API Integration Tests', () => {

  test('Pricing API: Myntra link extracts product info', async ({ request }) => {
    const myntraLink = 'https://www.myntra.com/shirts/roadster/roadster-men-olive-green--cotton-casual-shirt/11904108/buy';

    const apiResponse = await request.post('/api/pricing', {
      data: { query: myntraLink }
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = await apiResponse.json();
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);

    // All platforms should have a positive price
    for (const r of data.results) {
      expect(r.price).toBeGreaterThan(0);
      expect(r.currency).toBe('₹');
    }

    // Exactly one "isBest" entry (the lowest price)
    const bestItems = data.results.filter((r: { isBest: boolean }) => r.isBest);
    expect(bestItems.length).toBe(1);
  });

  test('Pricing API: Image base64 extracts product info', async ({ request }) => {
    const apiResponse = await request.post('/api/pricing', {
      data: { imageBase64: TINY_PNG_BASE64 }
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = await apiResponse.json();
    expect(data).toHaveProperty('results');
    expect(data.results.length).toBeGreaterThan(0);
  });

  test('Try-On API: Accepts base64 images and returns result', async ({ request }) => {
    const response = await request.post('/api/try-on', {
      data: {
        basePhotoData: TINY_PNG_BASE64,
        targetImageData: TINY_PNG_BASE64,
        targetIsLink: false
      }
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body).toHaveProperty('engine');
    expect(typeof body.result).toBe('string');
    // Result should always be a valid data URL or http URL
    const isDataUrl = body.result.startsWith('data:');
    const isHttpUrl = body.result.startsWith('http');
    expect(isDataUrl || isHttpUrl).toBe(true);
  });

  test('Login page renders without crash', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/login-page.png' });
    // Should not show 500 error
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Internal Server Error');
  });
});
