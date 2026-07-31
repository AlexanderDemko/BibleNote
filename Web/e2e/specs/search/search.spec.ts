import { test, expect } from '../../fixtures/app.fixture.js';

test('@search показывает индикатор, пока поиск не завершён', async ({ appPage: page }) => {
  let releaseSearch!: () => void;
  const searchCanFinish = new Promise<void>(resolve => { releaseSearch = resolve; });
  await page.route('**/api/search?**', async route => {
    await searchCanFinish;
    await route.continue();
  });

  await page.locator('#search').fill('Воскресение');

  const loading = page.locator('#tree .search-loading');
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('role', 'status');
  await expect(loading).toContainText('Идёт поиск…');

  releaseSearch();
  await expect(loading).toHaveCount(0);
  await expect(page.locator('#tree .search-result-row').filter({ hasText:'Благодать и надежда' })).toBeVisible();
});

test('@search полнотекстовый поиск находит заметку и открывает результат', async ({ appPage: page }) => {
  await page.locator('#search').fill('Воскресение');

  const result = page.locator('#tree .search-result-row').filter({ hasText: 'Благодать и надежда' });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await expect(page.locator('#content')).toContainText('Воскресение');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('onenote.searchHistory') || '[]')))
    .toContain('Воскресение');
});

test('@search общий поиск показывает текст Библии и открывает найденный стих', async ({ appPage: page }) => {
  await page.locator('#search').fill('В начале было Слово');

  const bibleGroup = page.locator('#tree .search-result-row').filter({ hasText:'Библия · Русский синодальный' });
  await expect(bibleGroup).toBeVisible();
  await expect(bibleGroup.locator('.count')).toHaveText('1 стих');

  await page.locator('#tree .bible-text-search-row').filter({ hasText:'Ин 1:1' }).click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 1');
  await expect(page.locator('#bible-verse-1-1')).toHaveClass(/selected/);
  await expect(page).toHaveURL(/\/bible\/rst\/43\/1\?verse=1$/);
});

test('@search односимвольные слова не раздувают подсветку и первое совпадение активно', async ({ appPage: page }) => {
  await page.locator('#search').fill('в тяжбе');
  const result = page.locator('#tree .search-result-row').filter({ hasText:'Благодать и надежда' });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('.match-nav .match-count')).toHaveText('1 / 1');
  await expect(page.locator('#content mark')).toHaveCount(1);
  await expect(page.locator('#content mark')).toHaveText(/тяжбе/i);
  await expect(page.locator('#content mark.current-match')).toHaveCount(1);
});

test('@search навигация по ссылке различает диапазон и повторы в HTML и полностью закрывается', async ({ appPage: page }) => {
  await page.evaluate(() => {
    const navigationStates: Array<Record<string, unknown>> = [];
    Object.defineProperty(window, '__e2eTargetNavigationStates', {
      configurable:true,
      value:navigationStates
    });
    window.addEventListener('message', event => {
      if (event.data?.type === 'onenote-target-navigation-state') navigationStates.push(event.data);
    });
  });
  await page.locator('#search').fill('Ин 3:16');

  const result = page.locator('#tree .search-result-row').filter({ hasText:'Благодать и надежда' });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('.match-nav .match-count')).toHaveText('1 / 3');
  await page.getByRole('button', { name:'Показать HTML' }).click();
  const htmlFrame = page.locator('#content iframe.html-frame');
  await expect(htmlFrame).toBeVisible();
  let navigationStateRequest = 0;
  const requestNavigationState = async (requestId: string) => {
    await htmlFrame.evaluate((element, id) => {
      (element as HTMLIFrameElement).contentWindow?.postMessage({
        type:'onenote-target-navigation-state-request',
        requestId:id
      }, '*');
    }, requestId);
    await expect.poll(() => page.evaluate(id => {
      const states = (window as Window & {
        __e2eTargetNavigationStates?: Array<Record<string, unknown>>;
      }).__e2eTargetNavigationStates || [];
      return states.some(state => state.requestId === id);
    }, requestId)).toBe(true);
    return page.evaluate(id => {
      const states = (window as Window & {
        __e2eTargetNavigationStates?: Array<Record<string, unknown>>;
      }).__e2eTargetNavigationStates || [];
      return [...states].reverse().find(state => state.requestId === id);
    }, requestId) as Promise<{ index:number; matchIndex:string; scrollTop:number }>;
  };
  const waitForNavigationState = async (expectedIndex: number, label: string) => {
    let state: { index:number; matchIndex:string; scrollTop:number } | undefined;
    await expect.poll(async () => {
      state = await requestNavigationState(`${label}-${navigationStateRequest++}`);
      return state.matchIndex;
    }).toBe(String(expectedIndex));
    return state!;
  };
  const firstState = await waitForNavigationState(0, 'first');
  expect(firstState.index).toBe(0);

  await page.getByRole('button', { name:'Следующее совпадение' }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('2 / 3');
  const secondState = await waitForNavigationState(1, 'second');
  expect(secondState.index).toBe(1);
  expect(Math.abs(secondState.scrollTop - firstState.scrollTop)).toBeLessThan(100);

  await page.getByRole('button', { name:'Следующее совпадение' }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('3 / 3');
  const thirdState = await waitForNavigationState(2, 'third');
  expect(thirdState.index).toBe(2);
  expect(thirdState.scrollTop).toBeGreaterThan(secondState.scrollTop + 300);

  await page.getByRole('button', { name:'Закрыть навигацию по совпадениям' }).click();
  await expect(page.locator('.match-nav')).toHaveCount(0);
  await expect(page).toHaveURL(/\/page\/page-grace$/);
});
