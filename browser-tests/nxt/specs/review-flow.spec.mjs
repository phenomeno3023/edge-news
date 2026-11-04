import {test, expect} from '@playwright/test';
import fs from 'node:fs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../../../preview/nxt/review-snapshot.json', import.meta.url), 'utf8'));
const sizes = [360, 390, 430, 768, 1280];

test('세션·종목 상세·검토 상세·목록 복귀를 실제 DOM 조작으로 확인한다', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/preview/nxt/');
  await expect(page.getByText('프리마켓 상승률 TOP10')).toBeVisible();
  await page.locator('.quote-card').first().click();
  await expect(page.locator('.detail-hero .ticker')).toContainText('PRE');
  await expect(page.getByRole('heading', {name: '뉴스·공시 시간순'})).toBeVisible();
  await expect(page.locator('.timeline-event').first()).toBeVisible();
  await expect(page.getByText(/상승 원인을 증명하지 않습니다/).first()).toBeVisible();
  await page.locator('[data-back]').click();
  await expect(page.locator('.detail-view')).toHaveCount(0);
  await page.getByRole('tab', {name: /애프터마켓/}).click();
  await expect(page.getByText('애프터마켓 상승률 TOP10')).toBeVisible();
  await expect(page.locator('.session-tab[data-session="AFTER"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.quote-card')).toHaveCount(10);
  await page.locator('[data-symbol]').first().click();
  await expect(page.locator('.detail-hero .ticker')).toContainText('AFTER');
  await expect(page.getByRole('heading', {name: snapshot.sessions.AFTER.items[0].name})).toBeVisible();
  await page.locator('[data-back]').click();
  await page.getByRole('tab', {name: /프리마켓/}).click();
  await expect(page.locator('.session-tab[data-session="PRE"]')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', {name: /검토 대기열/}).click();
  await page.locator('[data-review-id]').first().click();
  await expect(page.getByRole('heading', {name: 'Provenance 상세'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('검토 대기열 필터·페이지네이션·JSON 다운로드를 조작한다', async ({page}) => {
  const many = structuredClone(snapshot);
  const base = many.reviewQueue.items[0];
  many.reviewQueue.items = Array.from({length: 45}, (_, index) => ({...structuredClone(base), reviewId: `browser-${index}`, recordId: `browser-${index}`, title: `브라우저 검토 ${index}`, publishedAt: `2026-11-${String(1 + index % 3).padStart(2, '0')}T10:00:00Z`}));
  many.reviewQueue.page.total = 45;
  await page.route('**/review-snapshot.json', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(many)}));
  await page.goto('/preview/nxt/');
  await page.getByRole('button', {name: /검토 대기열/}).click();
  await expect(page.locator('.review-row')).toHaveCount(20);
  await page.locator('[data-filter="sourceType"]').selectOption(base.sourceType);
  await expect(page.locator('.pagination')).toContainText('1 / 3 페이지');
  await page.locator('[data-page="next"]').click();
  await expect(page.locator('.pagination')).toContainText('2 / 3 페이지');
  await expect(page.locator('[data-filter="sourceType"]')).toHaveValue(base.sourceType);
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', {name: '필터 결과 JSON 저장'}).click();
  const download = await downloadWait;
  const path = await download.path();
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(data.dataMode).toBe('synthetic_fixture');
  expect(data.filters.sourceType).toBe(base.sourceType);
  expect(data.returnedItems).toBeLessThanOrEqual(100);
  const csvWait = page.waitForEvent('download');
  await page.getByRole('button', {name: '필터 결과 CSV 저장'}).click();
  const csvDownload = await csvWait;
  const csv = fs.readFileSync(await csvDownload.path(), 'utf8');
  expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
  expect(csv.split('\r\n')[0]).toContain('"reviewId"');
  expect(csv.split('\r\n').length).toBeLessThanOrEqual(102);
});

for (const width of sizes) {
  test(`화면 폭 ${width}px에서 페이지 가로 넘침이 없다`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/preview/nxt/');
    await expect(page.locator('.quote-card')).toHaveCount(10);
    const topWidths = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
    expect(topWidths.scroll).toBeLessThanOrEqual(topWidths.client + 1);
    await page.locator('.quote-card').first().click();
    await expect(page.getByRole('heading', {name: '뉴스·공시 시간순'})).toBeVisible();
    const detailWidths = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
    expect(detailWidths.scroll).toBeLessThanOrEqual(detailWidths.client + 1);
    await page.locator('[data-back]').click();
    await page.getByRole('button', {name: /검토 대기열/}).click();
    const queueWidths = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
    expect(queueWidths.scroll).toBeLessThanOrEqual(queueWidths.client + 1);
  });
}

test('스냅샷 오류 후 다시 시도하면 안전한 화면으로 복구한다', async ({page}) => {
  let fail = true;
  await page.route('**/review-snapshot.json', route => fail
    ? route.abort()
    : route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(snapshot)}));
  await page.goto('/preview/nxt/');
  await expect(page.getByRole('button', {name: '다시 불러오기'})).toBeVisible();
  fail = false;
  await page.getByRole('button', {name: '다시 불러오기'}).click();
  await expect(page.locator('.quote-card')).toHaveCount(10);
});
