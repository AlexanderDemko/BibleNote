const SIDEBAR_MIN_WIDTH = 220;
let sidebarWidth = Number(localStorage.getItem('onenote.sidebarWidth')) || 390;
let sidebarCollapsed = localStorage.getItem('onenote.sidebarCollapsed') === 'true';

function clampSidebarWidth(value) {
  return Math.round(Math.max(SIDEBAR_MIN_WIDTH, Math.min(value, Math.min(650, window.innerWidth * .65))));
}

function applySidebarState() {
  sidebarWidth = clampSidebarWidth(sidebarWidth);
  document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px');
  app.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  sidebarToggle.textContent = sidebarCollapsed ? '›' : '‹';
  sidebarToggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
  sidebarToggle.setAttribute('aria-label', sidebarCollapsed ? 'Показать левую панель' : 'Скрыть левую панель');
  sidebarToggle.title = sidebarCollapsed ? 'Показать левую панель' : 'Скрыть левую панель';
  requestAnimationFrame(() => {
    updateTreeScrollbar?.();
    updateContentScrollbar?.();
  });
}

sidebarToggle.addEventListener('click', () => {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem('onenote.sidebarCollapsed', String(sidebarCollapsed));
  applySidebarState();
});

let resizingSidebar = false;
sidebarResizer.addEventListener('pointerdown', event => {
  if (sidebarCollapsed || window.innerWidth <= 760) return;
  resizingSidebar = true;
  sidebarResizer.classList.add('dragging');
  sidebarResizer.setPointerCapture(event.pointerId);
  document.body.style.userSelect = 'none';
});
sidebarResizer.addEventListener('pointermove', event => {
  if (!resizingSidebar) return;
  sidebarWidth = clampSidebarWidth(event.clientX);
  document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px');
});
const finishSidebarResize = event => {
  if (!resizingSidebar) return;
  resizingSidebar = false;
  sidebarResizer.classList.remove('dragging');
  if (sidebarResizer.hasPointerCapture(event.pointerId)) sidebarResizer.releasePointerCapture(event.pointerId);
  document.body.style.userSelect = '';
  localStorage.setItem('onenote.sidebarWidth', String(sidebarWidth));
};
sidebarResizer.addEventListener('pointerup', finishSidebarResize);
sidebarResizer.addEventListener('pointercancel', finishSidebarResize);
sidebarResizer.addEventListener('keydown', event => {
  if (sidebarCollapsed) return;
  if (event.key === 'ArrowLeft') sidebarWidth -= 10;
  else if (event.key === 'ArrowRight') sidebarWidth += 10;
  else if (event.key === 'Home') sidebarWidth = SIDEBAR_MIN_WIDTH;
  else if (event.key === 'End') sidebarWidth = Math.min(650, window.innerWidth * .65);
  else return;
  event.preventDefault();
  sidebarWidth = clampSidebarWidth(sidebarWidth);
  localStorage.setItem('onenote.sidebarWidth', String(sidebarWidth));
  applySidebarState();
});
window.addEventListener('resize', applySidebarState);

function setupCustomScrollbar(scroller, rail) {
  const thumb = rail.querySelector('.custom-scrollbar-thumb');
  let dragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;

  function measurements() {
    const railHeight = rail.clientHeight;
    const scrollRange = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const thumbHeight = scrollRange === 0
      ? railHeight
      : Math.max(36, Math.round(railHeight * scroller.clientHeight / scroller.scrollHeight));
    return { railHeight, scrollRange, thumbHeight, travel:Math.max(0, railHeight - thumbHeight) };
  }

  function update() {
    const value = measurements();
    const top = value.scrollRange > 0 ? value.travel * scroller.scrollTop / value.scrollRange : 0;
    thumb.style.height = value.thumbHeight + 'px';
    thumb.style.transform = 'translateY(' + Math.round(top) + 'px)';
    const inactive = value.scrollRange === 0;
    rail.classList.toggle('inactive', inactive);
    rail.tabIndex = inactive ? -1 : 0;
    rail.setAttribute('aria-hidden', String(inactive));
    rail.setAttribute('aria-valuemin', '0');
    rail.setAttribute('aria-valuemax', String(Math.round(value.scrollRange)));
    rail.setAttribute('aria-valuenow', String(Math.round(scroller.scrollTop)));
  }

  thumb.addEventListener('pointerdown', event => {
    if (rail.classList.contains('inactive')) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    dragStartY = event.clientY;
    dragStartScrollTop = scroller.scrollTop;
    thumb.classList.add('dragging');
    thumb.setPointerCapture?.(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    if (!dragging) return;
    event.preventDefault();
    const value = measurements();
    if (value.travel > 0) scroller.scrollTop = dragStartScrollTop + (event.clientY - dragStartY) * value.scrollRange / value.travel;
  });
  document.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
  });
  rail.addEventListener('pointerdown', event => {
    if (event.target === thumb || rail.classList.contains('inactive')) return;
    const value = measurements();
    const rect = rail.getBoundingClientRect();
    const targetTop = Math.max(0, Math.min(value.travel, event.clientY - rect.top - value.thumbHeight / 2));
    scroller.scrollTop = value.travel > 0 ? targetTop * value.scrollRange / value.travel : 0;
  });
  rail.addEventListener('keydown', event => {
    const page = Math.max(40, scroller.clientHeight * .85);
    if (event.key === 'ArrowDown') scroller.scrollBy({ top:40 });
    else if (event.key === 'ArrowUp') scroller.scrollBy({ top:-40 });
    else if (event.key === 'PageDown') scroller.scrollBy({ top:page });
    else if (event.key === 'PageUp') scroller.scrollBy({ top:-page });
    else if (event.key === 'Home') scroller.scrollTo({ top:0 });
    else if (event.key === 'End') scroller.scrollTo({ top:scroller.scrollHeight });
    else return;
    event.preventDefault();
  });
  scroller.addEventListener('scroll', update, { passive:true });
  new ResizeObserver(update).observe(scroller);
  new ResizeObserver(update).observe(rail);
  new MutationObserver(update).observe(scroller, { childList:true, subtree:true });
  requestAnimationFrame(update);
  return update;
}

const updateTreeScrollbar = setupCustomScrollbar(tree, treeScrollbar);
const updateContentScrollbar = setupCustomScrollbar(content, contentScrollbar);
applySidebarState();
