import { test, expect } from '@playwright/test';

test.describe('Timeline Jump Feature', () => {
  test('opens timeline month popover via Month Chip and shortcut G, and closes via Escape', async ({
    page,
  }) => {
    // Mock setup status and photo data to ensure deterministic Gallery rendering
    await page.route('**/api/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: true,
          accounts: [{ id: 'acc-1', email: 'user@example.com', displayName: 'Test User' }],
        }),
      });
    });

    await page.route('**/api/files/months*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          months: [
            { label: 'October 2026', year: 2026, monthKey: '2026-10', count: 150 },
            { label: 'September 2026', year: 2026, monthKey: '2026-09', count: 95 },
            { label: 'March 2024', year: 2024, monthKey: '2024-03', count: 115 },
          ],
          total: 360,
        }),
      });
    });

    await page.route('**/api/files/photos*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: [],
          total: 360,
        }),
      });
    });

    // Navigate to local web app
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for Month Chip in the top bar to render
    const monthChip = page.locator('[data-testid="timeline-month-chip"]');
    await expect(monthChip).toBeVisible({ timeout: 10000 });

    // Click Month Chip to open Popover
    await monthChip.click();

    // Verify dialog opens with correct accessibility role and label
    const dialog = page.locator('div[role="dialog"][aria-label="Jump to timeline month"]');
    await expect(dialog).toBeVisible();

    // Verify 4x3 month grid buttons exist
    const monthButtons = dialog.locator('button[aria-label*="items"]');
    const buttonCount = await monthButtons.count();
    expect(buttonCount).toBe(12);

    // Verify Escape key closes the popover
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Verify pressing 'g' re-opens the popover
    await page.keyboard.press('g');
    await expect(dialog).toBeVisible();

    // Close again via Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Verify floating Quick Jump buttons are present
    const jumpNewest = page.locator('[data-testid="jump-to-newest-btn"]');
    const jumpOldest = page.locator('[data-testid="jump-to-oldest-btn"]');
    await expect(jumpNewest).toBeVisible();
    await expect(jumpOldest).toBeVisible();
  });
});
