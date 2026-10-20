import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

async function runSimulation() {
  const screenshotDir = path.resolve('docs/screenshots');
  mkdirSync(screenshotDir, { recursive: true });

  console.log('Starting Vite local test server...');
  const server = await createServer({
    configFile: path.resolve('vite.config.ts'),
    server: { port: 5199 },
  });
  await server.listen();
  const url = 'http://localhost:5199';
  console.log(`Vite server running at ${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to Cargo Fit...');
  await page.goto(url);
  await page.waitForTimeout(1000);

  // 1. Cargo manifest intake
  console.log('Capturing Cargo Manifest Step...');
  await page.screenshot({ path: path.join(screenshotDir, '01-cargo-manifest.png') });

  // 2. Navigate to Decision comparison
  console.log('Navigating to Comparison...');
  const compLink = page.locator('a:has-text("Comparison")');
  if (await compLink.count()) await compLink.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(screenshotDir, '02-equipment-comparison.png') });

  // 3. Navigate to Plan step
  console.log('Navigating to Plan & 3D Spatial Arrangements...');
  const planLink = page.locator('a:has-text("Plan & Visual")');
  if (await planLink.count()) await planLink.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(screenshotDir, '03-isometric-plan-default.png') });

  // 4. Toggle Tactile Dock HUD
  console.log('Toggling Tactile Dock HUD...');
  const dockBtn = page.locator('button:has-text("Dock HUD")');
  if (await dockBtn.count()) {
    await dockBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '04-tactile-dock-hud.png') });
  }

  // 5. Test Exploded View
  console.log('Testing Exploded Assembly View...');
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('input[type="range"]');
    for (const s of sliders) {
      if (s.getAttribute('max') === '1' && s.getAttribute('step') === '0.05') {
        s.value = '0.5';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotDir, '05-isometric-exploded-view.png') });

  // 6. Test Longitudinal Cutaway
  console.log('Testing Longitudinal Cutaway...');
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('input[type="range"]');
    for (const s of sliders) {
      if (s.getAttribute('min') === '0.1' && s.getAttribute('max') === '1') {
        s.value = '0.6';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotDir, '06-isometric-cutaway-xray.png') });

  // 7. Toggle Technical Prussian Blueprint Mode
  console.log('Testing Technical Blueprint Mode...');
  const bpBtn = page.locator('button:has-text("Blueprint")');
  if (await bpBtn.count()) {
    await bpBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '07-technical-blueprint-mode.png') });
  }

  // 8. Mobile / Rugged Tablet Viewport simulation for Dock Persona
  console.log('Testing Rugged Tablet Viewport (Elena Rostova Persona)...');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotDir, '08-rugged-tablet-dock-mode.png') });

  console.log('Simulation complete! Closing browser and server...');
  await browser.close();
  await server.close();
  console.log('Done.');
}

runSimulation().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
