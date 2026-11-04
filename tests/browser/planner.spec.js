import { expect, test } from '@playwright/test';

async function dragHandleByFeet(page, handleSelector, cardSelector, deltaFeet, maxFeet) {
  const handle = page.locator(handleSelector);
  const track = page.locator(`${cardSelector} .profile-rectangle`);
  const handleBox = await handle.boundingBox();
  const trackBox = await track.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(trackBox).not.toBeNull();

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const deltaPx = (deltaFeet / maxFeet) * trackBox.width;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaPx, startY, { steps: 5 });
  await page.mouse.up();
}

test('loads under /oakwood-fence-permit/, initializes real 3D WebGL, and exercises mirrored controls, validation, reset, and views', async ({
  page,
  request,
}) => {
  const pageErrors = [];
  const consoleErrors = [];
  const badResponses = [];
  const loadedAssetUrls = [];

  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/oakwood-fence-permit/assets/')) {
      loadedAssetUrls.push(url);
    }
    if (res.status() >= 400) {
      badResponses.push(`${res.status()} ${url}`);
    }
  });

  await page.goto('/oakwood-fence-permit/');

  // 1. Require real 3D WebGL initialization (fallback must not mask a broken renderer)
  await expect(page.locator('#viewstatus')).toHaveText('3D · SW street-corner view');
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#scene canvas')).toBeVisible();
  await expect(page.locator('#fallback')).toBeHidden();
  await expect(page.locator('#view-toggle')).toHaveText('2D');
  await expect(page.locator('#view-toggle')).toBeEnabled();
  await expect(page.locator('#building-cycle')).toBeEnabled();
  await expect(page.locator('#building-cycle')).toHaveText('Buildings: Normal ↻');

  // Verify lazy scene chunk and assets loaded from the /oakwood-fence-permit/ prefix
  expect(loadedAssetUrls.some((u) => u.includes('/oakwood-fence-permit/assets/index-'))).toBe(true);
  expect(loadedAssetUrls.some((u) => u.includes('/oakwood-fence-permit/assets/scene-'))).toBe(true);
  expect(badResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  // Verify MIT license notice is served under the project prefix
  const licenseRes = await request.get('/oakwood-fence-permit/THREE-LICENSE.txt');
  expect(licenseRes.status()).toBe(200);
  const licenseText = await licenseRes.text();
  expect(licenseText).toContain('The MIT License');
  expect(licenseText).toContain('three.js authors');

  // Default BOM check
  await expect(page.locator('#results .totals')).toContainText(
    '123 ft total · 18 posts installed · 17 bays'
  );

  // 2. Exercise East run (left-to-right: NE -> Oakwood, max 101.5 ft)
  await page.locator('.east-control .exact-details summary').click();
  await page.locator('#east').fill('40');
  await expect(page.locator('#east-length-label')).toHaveText('40 / 101.5 ft');

  // Drag East transition handle leftward by 15 ft to create a 15 ft short section
  await dragHandleByFeet(page, '#east-height-slider', '.east-control', -15, 101.5);
  await expect(page.locator('#east-divide-label')).toHaveText('15 ft short');
  await expect(page.locator('#east-transition-location')).toHaveText(
    '6 → 4 ft at 25 ft from the NE corner'
  );

  // Drag East endpoint handle rightward by 20 ft (40 -> 60 ft): short section stays fixed at 15 ft
  await dragHandleByFeet(page, '#handle-east', '.east-control', 20, 101.5);
  await expect(page.locator('#east-length-label')).toHaveText('60 / 101.5 ft');
  await expect(page.locator('#east-divide-label')).toHaveText('15 ft short');
  await expect(page.locator('#east-transition-location')).toHaveText(
    '6 → 4 ft at 45 ft from the NE corner'
  );

  // Shorten East run to 10 ft: short section clamps to 10 ft
  await page.locator('#east').fill('10');
  await expect(page.locator('#east-divide-label')).toHaveText('10 ft short');
  await expect(page.locator('#east-transition-location')).toHaveText(
    'All 4 ft high · no transition'
  );

  // Re-extend East run to 25 ft: short section stays at clamped 10 ft
  await page.locator('#east').fill('25');
  await expect(page.locator('#east-divide-label')).toHaveText('10 ft short');
  await expect(page.locator('#east-transition-location')).toHaveText(
    '6 → 4 ft at 15 ft from the NE corner'
  );

  // 3. Exercise North run (mirrored right-to-left: Paine <- NE, max 61.5 ft)
  await page.locator('.north-control .exact-details summary').click();
  await page.locator('#north').fill('40');
  await expect(page.locator('#north-length-label')).toHaveText('40 / 61.5 ft');

  // Drag North transition handle rightward by 10 ft to create a 10 ft short section
  await dragHandleByFeet(page, '#north-height-slider', '.north-control', 10, 61.5);
  await expect(page.locator('#north-divide-label')).toHaveText('10 ft short');
  await expect(page.locator('#north-transition-location')).toHaveText(
    '6 → 4 ft at 30 ft from the NE corner'
  );

  // Keyboard navigation on North endpoint handle (mirrored: ArrowLeft increases length, Shift+ArrowRight decreases by 5 ft)
  const northEndpoint = page.locator('#handle-north');
  await northEndpoint.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#north-length-label')).toHaveText('40.5 / 61.5 ft');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#north-length-label')).toHaveText('35.5 / 61.5 ft');
  await expect(page.locator('#north-divide-label')).toHaveText('10 ft short');

  // Press End on North endpoint handle -> coordinate 61.5 -> length 0
  await page.keyboard.press('End');
  await expect(page.locator('#north-length-label')).toHaveText('0 / 61.5 ft');
  await expect(page.locator('#north-height-slider')).toBeDisabled();
  await expect(page.locator('#north-transition-location')).toHaveText('No fence on this run');

  // 4. Validation error and recovery
  await page.locator('details.settings summary').click();
  await page.locator('#spacing').fill('0');
  await expect(page.locator('#errors')).toContainText('greater than zero');
  await expect(page.locator('#results')).toHaveText('');

  await page.locator('#spacing').fill('8');
  await expect(page.locator('#errors')).toHaveText('');
  await expect(page.locator('#results .totals')).toContainText('25 ft total');

  // 5. Reset restores defaults
  await page.locator('#reset').click();
  await expect(page.locator('#east-length-label')).toHaveText('81.5 / 101.5 ft');
  await expect(page.locator('#north-length-label')).toHaveText('41.5 / 61.5 ft');
  await expect(page.locator('#east-divide-label')).toHaveText('0 ft short');
  await expect(page.locator('#north-divide-label')).toHaveText('0 ft short');
  await expect(page.locator('#results .totals')).toContainText(
    '123 ft total · 18 posts installed · 17 bays'
  );

  // 6. Building visibility modes and 2D/3D view switching
  const buildingBtn = page.locator('#building-cycle');
  await buildingBtn.click();
  await expect(buildingBtn).toHaveText('Buildings: Ghost ↻');
  await expect(buildingBtn).toHaveAttribute(
    'aria-label',
    'House and shed: Ghost. Next: Footprint.'
  );

  await buildingBtn.click();
  await expect(buildingBtn).toHaveText('Buildings: Footprint ↻');

  // Switch to 2D plan view
  await page.locator('#view-toggle').click();
  await expect(page.locator('#view-toggle')).toHaveText('3D');
  await expect(page.locator('#viewstatus')).toHaveText('2D survey plan');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#scene')).toBeHidden();
  await expect(buildingBtn).toBeDisabled();

  // Zoom in and reset in 2D
  await page.locator('#zoomIn').click();
  await expect(page.locator('#fallback')).toHaveAttribute('viewBox', /336/);
  await page.locator('#fit').click();
  await expect(page.locator('#fallback')).toHaveAttribute('viewBox', '0 0 420 410');

  // Switch back to 3D and verify building mode choice was preserved
  await page.locator('#view-toggle').click();
  await expect(page.locator('#view-toggle')).toHaveText('2D');
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#fallback')).toBeHidden();
  await expect(buildingBtn).toBeEnabled();
  await expect(buildingBtn).toHaveText('Buildings: Footprint ↻');

  await buildingBtn.click();
  await expect(buildingBtn).toHaveText('Buildings: Normal ↻');
});

test('falls back cleanly to interactive 2D SVG plan when WebGL context creation fails', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (typeof type === 'string' && type.toLowerCase().includes('webgl')) {
        return null;
      }
      return origGetContext.call(this, type, ...args);
    };
  });

  await page.goto('/oakwood-fence-permit/');

  await expect(page.locator('#viewstatus')).toHaveText('2D plan · 3D unavailable');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#scene')).toBeHidden();
  await expect(page.locator('#view-toggle')).toBeDisabled();
  await expect(page.locator('#view-toggle')).toHaveText('2D');
  await expect(page.locator('#building-cycle')).toBeDisabled();

  // SVG fallback contains lot/building polygons and active fence lines/posts
  const initialRectCount = await page.locator('#fallback rect').count();
  expect(initialRectCount).toBe(18);

  // Controls and BOM still update the fallback SVG plan cleanly
  await page.locator('.north-control .exact-details summary').click();
  await page.locator('#north').fill('0');
  await expect(page.locator('#results .totals')).toContainText(
    '81.5 ft total · 12 posts installed · 11 bays'
  );
  const updatedRectCount = await page.locator('#fallback rect').count();
  expect(updatedRectCount).toBe(12);
});

test('verifies 320px, 390px, and desktop layouts, keyboard focus/labels, 3D orbit, and print styles', async ({
  page,
}) => {
  await page.goto('/oakwood-fence-permit/');
  await expect(page.locator('#viewstatus')).toHaveText('3D · SW street-corner view');

  // Check 320px, 390px, and 1280px desktop responsive layouts
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(noHorizontalOverflow).toBe(true);

    // Both profile cards stay side-by-side at all viewport widths
    const eastBox = await page.locator('.east-control').boundingBox();
    const northBox = await page.locator('.north-control').boundingBox();
    expect(Math.abs(eastBox.y - northBox.y)).toBeLessThan(5);
    expect(northBox.x).toBeGreaterThan(eastBox.x);

    // Verify the active fence silhouette bars fill the profile track height and width
    const eastActiveBox = await page.locator('.east-control .active-fence').boundingBox();
    const eastSixBox = await page.locator('.east-control .six-profile').boundingBox();
    expect(eastSixBox.width).toBeGreaterThan(eastActiveBox.width * 0.95);
    expect(eastSixBox.height).toBeGreaterThan(100);
  }

  // Orbiting 3D scene updates camera and compass bearing
  const initialCompass = await page.locator('#compass-needle').evaluate((el) => el.style.transform);
  const sceneBox = await page.locator('#scene').boundingBox();
  await page.mouse.move(sceneBox.x + sceneBox.width / 2, sceneBox.y + sceneBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    sceneBox.x + sceneBox.width / 2 + 80,
    sceneBox.y + sceneBox.height / 2 + 20,
    { steps: 5 }
  );
  await page.mouse.up();
  const orbitedCompass = await page.locator('#compass-needle').evaluate((el) => el.style.transform);
  expect(orbitedCompass).not.toBe(initialCompass);

  // Keyboard focus and ARIA labels on handles
  await page.locator('#handle-east').focus();
  await expect(page.locator('#handle-east')).toBeFocused();
  await expect(page.locator('#handle-east')).toHaveAttribute(
    'aria-label',
    'East total fence length'
  );
  await expect(page.locator('#handle-east')).toHaveAttribute('aria-valuetext', '81.5 feet');

  // Emulate print stylesheet and verify interactive chrome is hidden while materials remain visible
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.visual-panel')).toBeHidden();
  await expect(page.locator('.controls')).toBeHidden();
  await expect(page.locator('#reset')).toBeHidden();
  await expect(page.locator('#print')).toBeHidden();
  await expect(page.locator('.materials')).toBeVisible();
  await expect(page.locator('#results .totals')).toBeVisible();
  await expect(page.locator('.notice')).toBeVisible();
});
