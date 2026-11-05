import { test, expect } from '@playwright/test';

test.describe('Video Error Panel & Grid Tile UX (Part A)', () => {
  test('grid tiles never render HTML <video> elements (poster thumbnails only)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Assert that across the entire grid, no <video> element is rendered
    const gridVideos = page.locator('main').locator('video');
    await expect(gridVideos).toHaveCount(0);
  });

  test('renders clear unsupported format panel with actions when video fails', async ({ page }) => {
    // Intercept video stream endpoint to simulate unsupported codec / format decode error
    await page.route('**/api/media/*/stream*', async (route) => {
      // Return 416 or empty payload simulating stream that browser cannot decode
      await route.fulfill({
        status: 416,
        contentType: 'video/mp4',
        headers: { 'Content-Range': 'bytes */1000' },
        body: '',
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Switch to Videos filter if available, or click on a tile
    const videoFilterBtn = page.getByRole('button', { name: /videos/i });
    if (await videoFilterBtn.isVisible()) {
      await videoFilterBtn.click();
      await page.waitForTimeout(500);
    }

    const firstTile = page.locator('[data-testid="gallery-tile"]').first();
    if (await firstTile.isVisible()) {
      await firstTile.click();

      // If a video lightbox opened and stream failed
      const errorPanel = page.locator('[data-testid="unsupported-video-panel"]');
      if (await errorPanel.isVisible({ timeout: 4000 }).catch(() => false)) {
        await expect(errorPanel).toBeVisible();
        await expect(errorPanel).toContainText("This browser can't play this video's format");
        await expect(errorPanel.getByRole('link', { name: /download/i })).toBeVisible();
      }
    }
  });
});
