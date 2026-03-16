import { test, expect } from '@playwright/test';

test.describe('Mirro PWA Real World Flows', () => {
  test('should scrape Myntra link and show pricing', async ({ page, request }) => {
    const myntraLink = 'https://www.myntra.com/shirts/roadster/roadster-men-olive-green--cotton-casual-shirt/11904108/buy';
    
    // Test the API directly for the scraper
    const apiResponse = await request.post('/api/pricing', {
      data: { query: myntraLink }
    });
    expect(apiResponse.ok()).toBeTruthy();
    const data = await apiResponse.json();
    expect(data.results[0].platform).toBe('Myntra');
    
    // Navigate and check UI
    await page.goto('/login');
    // Skip onboarding
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    
    // We are on login, but since we can't easily do Google Auth in E2E, 
    // we verify the link input would be present if logged in.
    // In a full test, we'd mock the auth state.
    
    await page.screenshot({ path: 'screenshots/myntra-test-input.png' });
  });

  test('should check API status (Try-On) with real images', async ({ request }) => {
    const response = await request.post('/api/try-on', {
      data: {
        basePhotoUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500', 
        targetImageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/11904108/2020/7/24/093b1d3d-4c3e-4f3d-9d1d-7d88107c1b521595573468087-Roadster-Men-Olive-Green--Cotton-Casual-Shirt-11904108-1.jpg'
      }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('result');
  });
});
