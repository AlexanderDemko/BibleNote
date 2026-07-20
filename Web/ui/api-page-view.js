function uiLog(action, details) {
  if (!verboseLoggingEnabled || action === 'api.runtime-log') return;
  fetch('/api/runtime-log', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ action, details })
  }).catch(() => {});
}

async function api(path, options) {
  const timeoutMs = options?.timeoutMs || 45000;
  const controller = new AbortController();
  const externalSignal = options?.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromExternalSignal, { once:true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchOptions = { ...(options || {}), signal:controller.signal };
  delete fetchOptions.timeoutMs;
  const method = fetchOptions.method || 'GET';
  const startedAt = Date.now();
  if (path !== '/api/runtime-log') uiLog('api.request', { method, path, timeoutMs });
  let response;
  let text = '';
  try {
    response = await fetch(path, fetchOptions);
    text = await response.text();
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? externalSignal?.aborted ? 'Request cancelled' : 'Request timed out after ' + timeoutMs + ' ms'
      : (error?.message || String(error));
    uiLog('api.error', { method, path, durationMs:Date.now() - startedAt, error:message });
    if (error?.name === 'AbortError') throw new Error(message);
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error:text || 'Invalid JSON response' };
  }
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    error.status = response.status;
    uiLog('api.error', { method, path, status:response.status, durationMs:Date.now() - startedAt, error:error.message });
    throw error;
  }
  if (!response.ok) throw new Error(body.error || 'Ошибка запроса');
  uiLog('api.response', { method, path, status:response.status, durationMs:Date.now() - startedAt });
  return body;
}

function decodeHtmlText(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(value || '');
  return textarea.value;
}

function normalizeParagraphText(value) {
  return decodeHtmlText(value).replace(/\s+/g, ' ').trim();
}

function pageHtmlFrameSrcdoc(rawHtml, bibleParagraphs, targetParagraphIndexes = []) {
  const normalizeBibleHref = href => String(href || '').trim()
    .replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:')
    .replace(/^https?:\/\/bnVerse:/i, 'bnVerse:');
  const isBibleHref = href => {
    const value = normalizeBibleHref(href);
    if (/^(?:isbtBibleVerse|bnVerse):/i.test(value)) return true;
    try {
      return /^(?:isbtBibleVerse|bnVerse):/i.test(normalizeBibleHref(decodeURIComponent(value)));
    } catch {
      return false;
    }
  };
  const isGraphImageSrc = src => {
    try {
      const value = new URL(String(src || ''), location.href);
      return value.protocol === 'https:' && value.hostname === 'graph.microsoft.com' && value.pathname.startsWith('/v1.0/');
    } catch {
      return false;
    }
  };
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml || '', 'text/html');
  const pageFindStyle = doc.createElement('style');
  pageFindStyle.textContent = '[data-onenote-page-find]{padding:0;background:#f5d76e;color:inherit;border-radius:2px;}[data-onenote-page-find-current]{background:#c99cff;outline:2px solid #7454a6;outline-offset:1px;}';
  doc.head.append(pageFindStyle);
  for (const link of doc.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') || '';
    if (!isBibleHref(href)) continue;
    link.setAttribute('data-onenote-bible-href', href);
    link.setAttribute('href', '#');
    link.setAttribute('target', '_self');
  }
  for (const image of doc.querySelectorAll('img[src]')) {
    const src = image.getAttribute('src') || '';
    if (!isGraphImageSrc(src)) continue;
    const absoluteSrc = new URL(src, location.href).toString();
    image.setAttribute('data-onenote-original-src', absoluteSrc);
    image.setAttribute('src', '/api/onenote-image?src=' + encodeURIComponent(absoluteSrc));
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
    image.removeAttribute('srcset');
  }
  const paragraphItems = (Array.isArray(bibleParagraphs) ? bibleParagraphs : [bibleParagraphs])
    .map(item => {
      if (typeof item === 'string') return { index:undefined, text:normalizeParagraphText(item), references:[] };
      return {
        index:Number.isInteger(Number(item?.index)) ? Number(item.index) : undefined,
        text:normalizeParagraphText(item?.text || ''),
        references:Array.isArray(item?.references) ? item.references : []
      };
    })
    .filter(item => item.text || item.references.length > 0);
  if (paragraphItems.length > 0) {
    const style = doc.createElement('style');
    style.textContent = '[data-onenote-target-paragraph="true"]{background:rgba(116,84,166,.16)!important;box-shadow:inset 4px 0 0 #7454a6!important;outline:1px solid rgba(116,84,166,.35)!important;scroll-margin:80px!important;}[data-onenote-target-paragraph-current="true"]{background:rgba(116,84,166,.26)!important;outline:2px solid #7454a6!important;}';
    doc.head.append(style);
    const used = new Set();
    const activeTargetIndexByParagraph = new Map(
      targetParagraphIndexes.filter(Number.isInteger).map((paragraphIndex, targetIndex) => [paragraphIndex, targetIndex])
    );
    const markParagraphElement = (element, paragraphIndex) => {
      used.add(element);
      if (Number.isInteger(paragraphIndex)) element.setAttribute('data-onenote-paragraph-index', String(paragraphIndex));
      const targetIndex = activeTargetIndexByParagraph.get(paragraphIndex);
      if (Number.isInteger(targetIndex)) {
        element.setAttribute('data-onenote-target-paragraph', 'true');
        element.setAttribute('data-onenote-target-paragraph-index', String(targetIndex));
        if (targetIndex === 0) element.setAttribute('data-onenote-target-paragraph-current', 'true');
      }
    };
    const refMatchesTarget = (link, references) => {
      const linkText = normalizeParagraphText(link.textContent);
      const href = normalizeBibleHref(decodeURIComponent(link.getAttribute('data-onenote-bible-href') || link.getAttribute('href') || ''));
      return references.some(ref => {
        const original = normalizeParagraphText(ref?.originalText);
        const normalized = normalizeParagraphText(ref?.normalizedRef);
        if (original && linkText === original) return true;
        if (normalized && linkText === normalized) return true;
        const bookIndex = Number(ref?.bookIndex);
        const chapter = Number(ref?.chapter);
        const verse = Number(ref?.verse);
        if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter) || !Number.isInteger(verse)) return false;
        return href.includes('/' + bookIndex + ' ' + chapter + ':' + verse)
          || href.includes('/' + bookIndex + '%20' + chapter + ':' + verse);
      });
    };
    const directNestedLists = element => element.matches('li')
      ? [...element.children].filter(child => child.matches('ol,ul'))
      : [];
    const targetCandidateText = element => {
      if (directNestedLists(element).length === 0) return normalizeParagraphText(element.textContent);
      return normalizeParagraphText([...element.childNodes]
        .filter(node => node.nodeType !== Node.ELEMENT_NODE || !node.matches('ol,ul'))
        .map(node => node.textContent || '')
        .join(' '));
    };
    const targetHighlightElement = (element, targetText, references) => {
      const paragraphBlockSelector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6';
      const allNestedParagraphBlocks = element.matches(paragraphBlockSelector)
        ? []
        : [...element.querySelectorAll(paragraphBlockSelector)];
      const nestedParagraphBlocks = allNestedParagraphBlocks.filter(block => !used.has(block));
      const matchingParagraphBlock = nestedParagraphBlocks
        .map(block => ({ block, text:targetCandidateText(block) }))
        .filter(item => item.text && targetText && item.text.includes(targetText))
        .sort((left, right) => left.text.length - right.text.length)[0]?.block;
      if (matchingParagraphBlock) return matchingParagraphBlock;
      const referenceParagraphBlock = nestedParagraphBlocks.find(block =>
        [...block.querySelectorAll('a[href],a[data-onenote-bible-href]')]
          .some(link => refMatchesTarget(link, references))
      );
      if (referenceParagraphBlock) return referenceParagraphBlock;
      if (element.matches('td,th') && allNestedParagraphBlocks.length > 0) return null;
      const nestedLists = directNestedLists(element);
      if (nestedLists.length === 0) return element;
      const directBlocks = [...element.children]
        .filter(child => !child.matches('ol,ul'));
      const matchingBlock = directBlocks
        .map(block => ({ block, text:targetCandidateText(block) }))
        .filter(item => item.text && (!targetText || item.text.includes(targetText)))
        .sort((left, right) => left.text.length - right.text.length)[0]?.block;
      if (matchingBlock) return matchingBlock;
      const referenceBlock = directBlocks.find(block =>
        [...block.querySelectorAll('a[href],a[data-onenote-bible-href]')]
          .some(link => refMatchesTarget(link, references))
      );
      if (referenceBlock) return referenceBlock;
      const ownNodes = [...element.childNodes]
        .filter(node => node.nodeType !== Node.ELEMENT_NODE || !node.matches('ol,ul'));
      if (ownNodes.length === 0) return element;
      const wrapper = doc.createElement('span');
      wrapper.style.display = 'block';
      element.insertBefore(wrapper, nestedLists[0]);
      ownNodes.forEach(node => wrapper.append(node));
      return wrapper;
    };
    const candidateRows = [...doc.body.querySelectorAll('p,div,li,td,th,blockquote,h1,h2,h3,h4,h5,h6')]
      .map(element => ({ element, text:targetCandidateText(element) }))
      .filter(candidate => candidate.text);
    const exactCandidatesByText = new Map();
    for (const candidate of candidateRows) {
      const exactCandidates = exactCandidatesByText.get(candidate.text) || [];
      exactCandidates.push(candidate.element);
      exactCandidatesByText.set(candidate.text, exactCandidates);
    }
    const bibleLinks = [...doc.body.querySelectorAll('a[href],a[data-onenote-bible-href]')];
    for (const paragraphItem of paragraphItems) {
      const targetText = paragraphItem.text;
      let best = null;
      if (targetText) {
        const exactElement = (exactCandidatesByText.get(targetText) || []).find(element => !used.has(element));
        if (exactElement) {
          best = { element:exactElement, text:targetText };
        } else for (const candidate of candidateRows) {
          if (used.has(candidate.element)) continue;
          if (!candidate.text.includes(targetText)) continue;
          if (!best || candidate.text.length < best.text.length) best = candidate;
        }
      }
      if (best?.element) {
        const highlightElement = targetHighlightElement(best.element, targetText, paragraphItem.references);
        if (highlightElement) markParagraphElement(highlightElement, paragraphItem.index);
        continue;
      }
      const link = bibleLinks.find(item => refMatchesTarget(item, paragraphItem.references));
      const target = link?.closest('li,p,td,th,blockquote,div') || link;
      if (target && !used.has(target)) {
        const highlightElement = targetHighlightElement(target, targetText, paragraphItem.references);
        if (highlightElement) markParagraphElement(highlightElement, paragraphItem.index);
      }
    }
  }
  const bridgeScript = [
    '<scr' + 'ipt>',
    '(function(){',
    'function decodeSafe(value){try{return decodeURIComponent(value);}catch(error){return value;}}',
    'function normalizeBibleHref(href){return String(href||"").trim().replace(/^https?:\\/\\/isbtBibleVerse:/i,"isbtBibleVerse:").replace(/^https?:\\/\\/bnVerse:/i,"bnVerse:");}',
    'function isBibleHref(href){return /^(?:isbtBibleVerse|bnVerse):/i.test(normalizeBibleHref(href))||/^(?:isbtBibleVerse|bnVerse):/i.test(normalizeBibleHref(decodeSafe(href||"")));}',
    'function sendBibleLink(href){parent.postMessage({type:"onenote-bible-link",href:normalizeBibleHref(decodeSafe(href))},"*");}',
    'document.addEventListener("click",function(event){',
    'var target=event.target;',
    'var link=target&&target.closest?target.closest("a[href]"):null;',
    'if(!link)return;',
    'var href=link.getAttribute("data-onenote-bible-href")||link.getAttribute("href")||"";',
    'if(isBibleHref(href)){event.preventDefault();event.stopPropagation();sendBibleLink(href);}',
    '},true);',
    'document.addEventListener("keydown",function(event){',
    'var key=String(event.key||"").toLocaleLowerCase();',
    'var findKey=event.code==="KeyF"||key==="f";',
    'if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&findKey){event.preventDefault();event.stopPropagation();parent.postMessage({type:"onenote-page-find-open"},"*");}',
    '},true);',
    'var pageFindMarks=[];var pageFindIndex=-1;var pageFindQuery="";',
    'function sendPageFindResult(){parent.postMessage({type:"onenote-page-find-result",query:pageFindQuery,count:pageFindMarks.length,index:pageFindIndex},"*");}',
    'function clearPageFind(){document.querySelectorAll("[data-onenote-page-find]").forEach(function(mark){var parentNode=mark.parentNode;mark.replaceWith(document.createTextNode(mark.textContent||""));if(parentNode)parentNode.normalize();});pageFindMarks=[];pageFindIndex=-1;}',
    'function selectPageFind(index,scroll){pageFindMarks.forEach(function(mark){mark.removeAttribute("data-onenote-page-find-current");});if(!pageFindMarks.length){pageFindIndex=-1;sendPageFindResult();return;}pageFindIndex=(index+pageFindMarks.length)%pageFindMarks.length;var mark=pageFindMarks[pageFindIndex];mark.setAttribute("data-onenote-page-find-current","true");if(scroll!==false)mark.scrollIntoView({block:"center",behavior:"smooth"});sendPageFindResult();}',
    'function runPageFind(query){clearPageFind();pageFindQuery=String(query||"");if(!pageFindQuery){sendPageFindResult();return;}var nodes=[];var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(node){var parentNode=node.parentElement;if(!node.nodeValue||!parentNode||parentNode.closest("script,style,noscript,textarea,[data-onenote-page-find]"))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT;}});while(walker.nextNode())nodes.push(walker.currentNode);var needle=pageFindQuery.toLocaleLowerCase();nodes.forEach(function(node){var text=node.nodeValue||"";var folded=text.toLocaleLowerCase();var cursor=0;var index=folded.indexOf(needle);if(index<0)return;var fragment=document.createDocumentFragment();while(index>=0){if(index>cursor)fragment.append(document.createTextNode(text.slice(cursor,index)));var mark=document.createElement("mark");mark.setAttribute("data-onenote-page-find","true");mark.textContent=text.slice(index,index+pageFindQuery.length);fragment.append(mark);pageFindMarks.push(mark);cursor=index+pageFindQuery.length;index=folded.indexOf(needle,cursor);}if(cursor<text.length)fragment.append(document.createTextNode(text.slice(cursor)));node.replaceWith(fragment);});selectPageFind(0,true);}',
    'function clearTargetParagraphs(){document.querySelectorAll("[data-onenote-target-paragraph]").forEach(function(item){item.removeAttribute("data-onenote-target-paragraph");item.removeAttribute("data-onenote-target-paragraph-index");item.removeAttribute("data-onenote-target-paragraph-current");});}',
    'function setTargetParagraphs(indexes){clearTargetParagraphs();(Array.isArray(indexes)?indexes:[]).forEach(function(paragraphIndex,targetIndex){var target=document.querySelector("[data-onenote-paragraph-index=\\\""+paragraphIndex+"\\\"]");if(!target)return;target.setAttribute("data-onenote-target-paragraph","true");target.setAttribute("data-onenote-target-paragraph-index",String(targetIndex));if(targetIndex===0)target.setAttribute("data-onenote-target-paragraph-current","true");});}',
    'function scrollTargetParagraph(index){var selector="[data-onenote-target-paragraph=true]";var target=Number.isInteger(index)?document.querySelector("[data-onenote-target-paragraph-index=\\"" + index + "\\"]"):document.querySelector(selector);document.querySelectorAll(selector).forEach(function(item){item.removeAttribute("data-onenote-target-paragraph-current");});if(target){target.setAttribute("data-onenote-target-paragraph-current","true");target.scrollIntoView({block:"center"});}}',
    'window.addEventListener("message",function(event){',
    'var data=event.data||{};',
    'if(data.type==="onenote-html-zoom"){document.documentElement.style.zoom=String(data.zoom||1);}',
    'if(data.type==="onenote-scroll-target-paragraph"){var index=Number.isInteger(data.targetIndex)?data.targetIndex:undefined;scrollTargetParagraph(index);setTimeout(function(){scrollTargetParagraph(index);},80);setTimeout(function(){scrollTargetParagraph(index);},240);}',
    'if(data.type==="onenote-page-find"){runPageFind(data.query);}',
    'if(data.type==="onenote-page-find-next"&&String(data.query||"")===pageFindQuery){selectPageFind(pageFindIndex+(Number(data.delta)<0?-1:1),true);}',
    'if(data.type==="onenote-page-find-clear"){clearPageFind();pageFindQuery="";}',
    'if(data.type==="onenote-set-target-paragraphs"){setTargetParagraphs(data.paragraphIndexes);}',
    'if(data.type==="onenote-clear-target-paragraphs"){clearTargetParagraphs();}',
    '});',
    'parent.postMessage({type:"onenote-html-ready"},"*");',
    'window.addEventListener("load",function(){scrollTargetParagraph();setTimeout(scrollTargetParagraph,80);setTimeout(scrollTargetParagraph,240);});',
    '}());',
    '</scr' + 'ipt>'
  ].join('');
  doc.body.insertAdjacentHTML('beforeend', bridgeScript);
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

async function loadPageHtmlWithFallback(params, options = {}) {
  try {
    return { ...(await api('/api/page-html?' + params.toString(), { timeoutMs:5000, signal:options.signal })), degraded:false };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const rawParams = new URLSearchParams(params);
    rawParams.set('raw', '1');
    const raw = await api('/api/page-html?' + rawParams.toString(), { timeoutMs:5000, signal:options.signal });
    return {
      ...raw,
      degraded:true,
      warning:'HTML показан из локального кэша без обновления библейских ссылок: ' + (error?.message || String(error))
    };
  }
}

async function waitForPageHtmlRefresh(params, options = {}) {
  const deadline = Date.now() + (options.timeoutMs || 45000);
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (options.signal?.aborted) return undefined;
    try {
      const result = await api('/api/page-html?' + params.toString(), {
        timeoutMs:5000,
        signal:options.signal
      });
      if (!result.refreshing) return { ...result, bibleReparsed:true };
    } catch (error) {
      if (options.signal?.aborted) return undefined;
      console.warn(error);
    }
  }
  return undefined;
}

function postHtmlFrameZoom(frame, percent) {
  const zoom = Math.max(50, Math.min(200, Number(percent) || 100)) / 100;
  frame?.contentWindow?.postMessage({ type:'onenote-html-zoom', zoom }, '*');
}

function waitForHtmlFrameReady(frame, signal) {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', handleMessage);
      frame.removeEventListener('load', finish);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const handleMessage = event => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'onenote-html-ready') return;
      finish();
    };
    window.addEventListener('message', handleMessage);
    frame.addEventListener('load', finish);
    signal?.addEventListener('abort', finish, { once:true });
    if (signal?.aborted) finish();
  });
}

async function openBibleRef(rawRef) {
  uiLog('ui.openBibleRef', { rawRef });
  const normalizedRef = String(rawRef || '').trim()
    .replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:')
    .replace(/^https?:\/\/bnVerse:/i, 'bnVerse:');
  const params = new URLSearchParams({ ref:normalizedRef, module:currentBibleModule() });
  const result = await api('/api/bible/parse-link?' + params.toString());
  if (result.reference) await showBibleText(result.reference);
}

window.bibleNoteOpenBibleRef = openBibleRef;

window.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'onenote-page-find-open') {
    const frame = visiblePageHtmlFrame();
    if (!frame || event.source !== frame.contentWindow) return;
    openPageFind();
    return;
  }
  if (data.type === 'onenote-page-find-result') {
    const frame = visiblePageHtmlFrame();
    if (!frame || event.source !== frame.contentWindow || pageFindWidget.classList.contains('hidden')) return;
    if (String(data.query || '') !== pageFindInput.value) return;
    setPageFindStatus(Math.max(0, Number(data.count) || 0), Number.isInteger(data.index) ? data.index : -1);
    return;
  }
  if (data.type !== 'onenote-bible-link' || typeof data.href !== 'string') return;
  openBibleRef(data.href).catch(showError);
});
