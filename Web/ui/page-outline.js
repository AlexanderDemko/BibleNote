'use strict';

let pageOutlineSequence = 0;

function createPageOutlineViewer(frame, signal, options = {}) {
  const viewer = document.createElement('div');
  viewer.className = 'document-viewer';
  const toolbar = document.createElement('div');
  toolbar.className = 'document-toolbar';
  toolbar.hidden = Boolean(options.oneNote);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'document-outline-toggle';
  toggle.textContent = '☷ Структура';
  toggle.setAttribute('aria-label', 'Структура документа');
  const count = document.createElement('span');
  count.className = 'document-outline-count';
  toolbar.append(toggle, count);

  const body = document.createElement('div');
  body.className = 'document-viewer-body';
  const panel = document.createElement('nav');
  panel.className = 'document-outline';
  panel.id = 'document-outline-' + ++pageOutlineSequence;
  panel.setAttribute('aria-label', 'Структура документа');
  toggle.setAttribute('aria-controls', panel.id);
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.className = 'document-outline-filter';
  filter.placeholder = 'Найти заголовок';
  filter.setAttribute('aria-label', 'Найти заголовок');
  const list = document.createElement('ol');
  list.className = 'document-outline-list';
  const empty = document.createElement('p');
  empty.className = 'document-outline-empty';
  panel.append(filter, list, empty);
  body.append(panel, frame);
  viewer.append(toolbar, body);

  const resizer = document.createElement('div');
  resizer.className = 'document-outline-resizer';
  resizer.tabIndex = 0;
  resizer.setAttribute('role', 'separator');
  resizer.setAttribute('aria-label', 'Ширина панели структуры');
  resizer.setAttribute('aria-orientation', 'vertical');
  resizer.setAttribute('aria-controls', panel.id);
  resizer.title = 'Потяните, чтобы изменить ширину. Двойной щелчок — исходная ширина.';
  panel.append(resizer);

  const widthPreferenceKey = 'onenote.documentOutlineWidth';
  const savedWidth = Number(localStorage.getItem(widthPreferenceKey));
  let preferredWidth = Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : null;
  let resizeDrag = null;
  const outlineWidthLimits = () => {
    const available = body.clientWidth;
    const max = Math.max(0, Math.floor(Math.min(600, available <= 600 ? available * .85 : available - 240)));
    return { min:Math.min(180, max), max };
  };
  const applyOutlineWidth = () => {
    if (!body.clientWidth) return;
    const { min, max } = outlineWidthLimits();
    const width = Math.round(Math.max(min, Math.min(preferredWidth ?? Math.min(280, body.clientWidth * .28), max)));
    body.style.setProperty('--document-outline-width', width + 'px');
    resizer.setAttribute('aria-valuemin', String(min));
    resizer.setAttribute('aria-valuemax', String(max));
    resizer.setAttribute('aria-valuenow', String(width));
    resizer.setAttribute('aria-valuetext', width + ' пикселей');
  };
  const changeOutlineWidth = value => {
    const { min, max } = outlineWidthLimits();
    preferredWidth = Math.round(Math.max(min, Math.min(value, max)));
    applyOutlineWidth();
  };
  const finishResize = event => {
    if (!resizeDrag || (event?.pointerId != null && event.pointerId !== resizeDrag.pointerId)) return;
    const { pointerId } = resizeDrag;
    resizeDrag = null;
    viewer.classList.remove('resizing-outline');
    if (resizer.hasPointerCapture(pointerId)) resizer.releasePointerCapture(pointerId);
    if (preferredWidth != null) localStorage.setItem(widthPreferenceKey, String(preferredWidth));
  };
  resizer.addEventListener('pointerdown', event => {
    if (event.button !== 0 || resizeDrag) return;
    event.preventDefault();
    resizeDrag = { pointerId:event.pointerId, x:event.clientX, width:panel.getBoundingClientRect().width };
    resizer.focus({ preventScroll:true });
    resizer.setPointerCapture(event.pointerId);
    viewer.classList.add('resizing-outline');
  });
  resizer.addEventListener('pointermove', event => {
    if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) return;
    changeOutlineWidth(resizeDrag.width + event.clientX - resizeDrag.x);
  });
  resizer.addEventListener('pointerup', finishResize);
  resizer.addEventListener('pointercancel', finishResize);
  resizer.addEventListener('lostpointercapture', finishResize);
  resizer.addEventListener('dblclick', () => {
    preferredWidth = null;
    localStorage.removeItem(widthPreferenceKey);
    applyOutlineWidth();
  });
  resizer.addEventListener('keydown', event => {
    const width = panel.getBoundingClientRect().width;
    const step = event.shiftKey ? 40 : 10;
    if (event.key === 'ArrowLeft') changeOutlineWidth(width - step);
    else if (event.key === 'ArrowRight') changeOutlineWidth(width + step);
    else if (event.key === 'Home') changeOutlineWidth(outlineWidthLimits().min);
    else if (event.key === 'End') changeOutlineWidth(outlineWidthLimits().max);
    else return;
    event.preventDefault();
    event.stopPropagation();
    localStorage.setItem(widthPreferenceKey, String(preferredWidth));
  });
  const widthObserver = new ResizeObserver(applyOutlineWidth);
  widthObserver.observe(body);
  signal?.addEventListener('abort', () => {
    finishResize();
    widthObserver.disconnect();
  }, { once:true });

  let headings = [];
  let rows = [];
  let activeIndex = -1;
  let initialized = false;
  const collapsed = new Set();
  const post = message => frame.contentWindow?.postMessage(message, '*');
  const setOpen = (open, remember = false) => {
    if (!open) finishResize();
    panel.hidden = !open;
    if (open) applyOutlineWidth();
    toggle.setAttribute('aria-expanded', String(open));
    if (remember) localStorage.setItem('onenote.documentOutlineOpen', String(open));
    post({ type:'onenote-outline-tracking', enabled:open });
  };
  setOpen(false);
  toggle.addEventListener('click', () => setOpen(panel.hidden, true));
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false, true);
    toggle.focus();
  });

  const updateActive = index => {
    rows[activeIndex]?.button.removeAttribute('aria-current');
    activeIndex = index;
    const row = rows[activeIndex];
    if (!row) return;
    row.button.setAttribute('aria-current', 'location');
    // Keep the reader's keyboard focus and document scroll position intact.
    if (!panel.hidden && row.button.getClientRects().length && !panel.contains(document.activeElement)) {
      const bounds = row.button.getBoundingClientRect();
      const viewport = list.getBoundingClientRect();
      if (bounds.top < viewport.top) list.scrollTop -= viewport.top - bounds.top;
      else if (bounds.bottom > viewport.bottom) list.scrollTop += bounds.bottom - viewport.bottom;
    }
  };
  const applyFilter = () => {
    const query = filter.value.trim().toLocaleLowerCase();
    const visible = new Set();
    for (const row of rows) {
      if (!query || row.heading.text.toLocaleLowerCase().includes(query)) {
        let current = row;
        while (current && !visible.has(current)) {
          visible.add(current);
          current = current.parent;
        }
      }
    }
    for (const row of rows) {
      row.item.hidden = !visible.has(row);
      if (row.children) {
        const expanded = Boolean(query) || !collapsed.has(row.heading.index);
        row.children.hidden = !expanded;
        row.disclosure.setAttribute('aria-expanded', String(expanded));
        row.disclosure.textContent = expanded ? '▾' : '▸';
        row.disclosure.disabled = Boolean(query);
      }
    }
    empty.hidden = visible.size > 0;
    empty.textContent = headings.length
      ? 'Заголовки не найдены.'
      : 'В документе нет заголовков. Для Word используйте стили «Заголовок 1», «Заголовок 2» и т. д., затем синхронизируйте файл.';
    filter.hidden = headings.length === 0;
  };
  filter.addEventListener('input', applyFilter);

  const render = () => {
    list.replaceChildren();
    rows = [];
    const stack = [];
    for (const heading of headings) {
      while (stack.length && stack[stack.length - 1].heading.level >= heading.level) stack.pop();
      const parentRow = stack[stack.length - 1];
      const item = document.createElement('li');
      const line = document.createElement('div');
      line.className = 'document-outline-row';
      const disclosure = document.createElement('button');
      disclosure.type = 'button';
      disclosure.className = 'document-outline-disclosure';
      disclosure.hidden = true;
      disclosure.setAttribute('aria-label', 'Подразделы: ' + heading.text);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'document-outline-link';
      button.textContent = heading.text;
      button.title = heading.text;
      button.addEventListener('click', () => {
        post({ type:'onenote-outline-navigate', index:heading.index });
        updateActive(heading.index);
        if (body.clientWidth <= 600) setOpen(false);
      });
      line.append(disclosure, button);
      item.append(line);
      const row = { heading, item, button, disclosure, parent:parentRow, children:null };
      if (parentRow && !parentRow.children) {
        parentRow.children = document.createElement('ol');
        parentRow.children.id = panel.id + '-children-' + parentRow.heading.index;
        parentRow.disclosure.hidden = false;
        parentRow.disclosure.setAttribute('aria-controls', parentRow.children.id);
        parentRow.item.append(parentRow.children);
      }
      (parentRow?.children || list).append(item);
      disclosure.addEventListener('click', () => {
        if (collapsed.has(heading.index)) collapsed.delete(heading.index);
        else collapsed.add(heading.index);
        applyFilter();
      });
      rows.push(row);
      stack.push(row);
    }
    count.textContent = 'Заголовков: ' + headings.length;
    applyFilter();
    updateActive(activeIndex);
  };

  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data || {};
    if (data.type === 'onenote-outline') {
      headings = (Array.isArray(data.headings) ? data.headings : []).map((heading, index) => ({
        index,
        level:Math.max(1, Math.min(9, Number(heading.level) || 1)),
        text:String(heading.text || '')
      }));
      toolbar.hidden = Boolean(options.oneNote) && headings.length === 0;
      if (toolbar.hidden) setOpen(false);
      render();
      if (!initialized) {
        initialized = true;
        const preference = localStorage.getItem('onenote.documentOutlineOpen');
        setOpen(!toolbar.hidden && (preference === 'true' || (preference == null && headings.length > (options.oneNote ? 0 : 1))));
      }
    }
    if (data.type === 'onenote-outline-active' && Number.isInteger(data.index)) updateActive(data.index);
  }, { signal });
  frame.addEventListener('load', () => post({
    type:'onenote-outline-request', oneNote:Boolean(options.oneNote), title:options.title
  }), { signal });
  return viewer;
}
