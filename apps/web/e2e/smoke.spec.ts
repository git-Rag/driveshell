import { test, expect } from '@playwright/test';

test.describe('Sunflower Drive Web Smoke Test', () => {
  test('loads without white screen, page errors, or 404 media requests', async ({ page }) => {
    const pageErrors: Error[] = [];
    const media404s: string[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err);
    });

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/media/') && response.status() === 404) {
        media404s.push(url);
      }
    });

    // Navigate to local dev/preview URL
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);

    // Assert zero uncaught JavaScript page errors (no syntax errors, no missing exports)
    expect(pageErrors).toEqual([]);

    // Assert no 404 responses on /api/media/*
    expect(media404s).toEqual([]);

    // Assert root element is mounted and visible
    const rootEl = page.locator('#root');
    await expect(rootEl).toBeVisible();

    // Assert ErrorBoundary fallback is NOT shown
    const errorHeading = page.getByRole('heading', { name: /something went wrong/i });
    await expect(errorHeading).toHaveCount(0);
  });
});
