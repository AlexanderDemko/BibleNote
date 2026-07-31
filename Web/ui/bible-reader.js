let inductiveStyles = [];
let inductiveAnnotations = [];
let inductiveRelations = [];
let inductiveMode = localStorage.getItem('biblenote.inductive.mode') === '1';
let inductiveSelection = null;
let inductivePopover = null;
let inductiveUndoStack = [];
let inductiveRedoStack = [];
let inductiveMarksVisible = localStorage.getItem('biblenote.inductive.visible') !== '0';
if (inductiveMode) inductiveMarksVisible = true;
let inductiveUndoButton = null;
let inductiveRedoButton = null;
let inductiveVisibilityButton = null;
let inductiveObservationsPanel = null;
let inductivePanelCollapsed = localStorage.getItem('biblenote.inductive.panelCollapsed') === '1';
let inductiveObservationStyleFilter = null;
let inductiveRelationDraft = null;
let inductiveRelationEditingId = null;
let inductiveJustCreatedRelationId = null;
let inductiveActiveRelationIds = [];
let inductiveActiveRelationAnchorIds = [];
let inductiveVerseTextByVerse = new Map();
let inductiveEventsReady = false;
const exportInductiveMarkingsButton = document.getElementById('exportInductiveMarkings');
const importInductiveMarkingsButton = document.getElementById('importInductiveMarkings');
const importInductiveMarkingsFile = document.getElementById('importInductiveMarkingsFile');
const importInductiveMarkingsStatus = document.getElementById('importInductiveMarkingsStatus');

const inductiveRelationTypes = {
  contrast:{ name:'Контраст', symbol:'↔' },
  comparison:{ name:'Сравнение', symbol:'≈' },
  cause:{ name:'Причина → следствие', symbol:'→', sourceRole:'причина', targetRole:'следствие' },
  conclusion:{ name:'Вывод (устаревшая связь)', symbol:'∴', sourceRole:'основание', targetRole:'вывод' }
};
const inductiveAvailableRelationTypes = ['contrast', 'comparison', 'cause'];
const inductiveLegacyRelationStyleIds = new Set(['contrast', 'comparison']);

function inductiveRelationType(type) {
  return inductiveRelationTypes[type] || { name:type, symbol:'⌁' };
}

function inductiveRelationEndpointBadge(endpoint) {
  const definition = inductiveRelationType(endpoint.type);
  if (!definition.sourceRole) return definition.symbol;
  return endpoint.side === 'source' ? '①→' : '→②';
}

function inductiveRelationEndpointTitle(endpoint) {
  const definition = inductiveRelationType(endpoint.type);
  const role = endpoint.side === 'source' ? definition.sourceRole : definition.targetRole;
  return definition.name + (role ? ' — ' + role : '');
}

function inductiveStyleForAnnotation(annotation) {
  return inductiveStyles.find(style => style.id === annotation.styleId) || {
    id:annotation.styleId,
    name:annotation.styleName || annotation.styleId,
    symbol:annotation.styleSymbol || '◆',
    color:annotation.styleColor || '#6d5200',
    backgroundColor:annotation.styleBackgroundColor || '#f6df88',
    decoration:annotation.styleDecoration || 'highlight'
  };
}

async function loadInductiveChapter(location) {
  const params = new URLSearchParams({
    module:location.module,
    bookIndex:String(location.bookIndex),
    chapter:String(location.chapter)
  });
  const [stylesResult, annotationsResult, relationsResult] = await Promise.all([
    inductiveStyles.length > 0 ? Promise.resolve({ styles:inductiveStyles }) : api('/api/inductive/styles'),
    api('/api/inductive/annotations?' + params.toString()),
    api('/api/inductive/relations?' + params.toString())
  ]);
  inductiveStyles = Array.isArray(stylesResult.styles) ? stylesResult.styles : [];
  inductiveAnnotations = Array.isArray(annotationsResult.annotations) ? annotationsResult.annotations : [];
  inductiveRelations = Array.isArray(relationsResult.relations) ? relationsResult.relations : [];
  inductiveRelationDraft = null;
  inductiveRelationEditingId = null;
  inductiveJustCreatedRelationId = null;
  inductiveActiveRelationIds = [];
  inductiveActiveRelationAnchorIds = [];
  inductiveUndoStack = [];
  inductiveRedoStack = [];
  updateInductiveActionButtons();
}

function updateInductiveActionButtons() {
  if (inductiveUndoButton) {
    inductiveUndoButton.disabled = inductiveUndoStack.length === 0;
    inductiveUndoButton.title = '\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 (\u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u0438: ' + inductiveUndoStack.length + ')';
  }
  if (inductiveRedoButton) {
    inductiveRedoButton.disabled = inductiveRedoStack.length === 0;
    inductiveRedoButton.title = '\u0412\u0435\u0440\u043d\u0443\u0442\u044c \u043e\u0442\u043c\u0435\u043d\u0451\u043d\u043d\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 (\u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u0438: ' + inductiveRedoStack.length + ')';
  }
  if (exportInductiveMarkingsButton) exportInductiveMarkingsButton.disabled = inductiveAnnotations.length === 0 && inductiveRelations.length === 0;
}

function clearInductiveHistory() {
  inductiveUndoStack = [];
  inductiveRedoStack = [];
}

function pushInductiveUndoAction(action) {
  if (!action) return;
  inductiveUndoStack.push(action);
  if (inductiveUndoStack.length > 100) inductiveUndoStack.shift();
  inductiveRedoStack = [];
  updateInductiveActionButtons();
}

function rebaseInductiveRelationHistoryId(previousId, nextId) {
  if (!previousId || !nextId || previousId === nextId) return;
  for (const stack of [inductiveUndoStack, inductiveRedoStack]) {
    for (const action of stack) {
      for (const key of ['relation', 'before', 'after']) {
        if (action[key]?.id === previousId) action[key] = { ...action[key], id:nextId };
      }
    }
  }
  inductiveActiveRelationIds = inductiveActiveRelationIds.map(id => id === previousId ? nextId : id);
  inductiveActiveRelationAnchorIds = inductiveActiveRelationAnchorIds.map(key => {
    if (key === previousId + ':source') return nextId + ':source';
    if (key === previousId + ':target') return nextId + ':target';
    return key;
  });
  if (inductiveRelationEditingId === previousId) inductiveRelationEditingId = nextId;
  if (inductiveJustCreatedRelationId === previousId) inductiveJustCreatedRelationId = nextId;
}

function updateInductiveVisibilityButton() {
  if (!inductiveVisibilityButton) return;
  if (inductiveMode) {
    inductiveMarksVisible = true;
    localStorage.setItem('biblenote.inductive.visible', '1');
  }
  inductiveVisibilityButton.disabled = inductiveMode;
  inductiveVisibilityButton.classList.toggle('active', !inductiveMarksVisible);
  inductiveVisibilityButton.innerHTML = inductiveMarksVisible
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.8"/><path d="M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.6"/></svg>';
  inductiveVisibilityButton.title = inductiveMode
    ? '\u0420\u0430\u0437\u043c\u0435\u0442\u043a\u0430 \u0432\u0441\u0435\u0433\u0434\u0430 \u0432\u0438\u0434\u043d\u0430 \u0432 \u0440\u0435\u0436\u0438\u043c\u0435 \u0440\u0430\u0437\u043c\u0435\u0442\u043a\u0438'
    : inductiveMarksVisible ? '\u0421\u043a\u0440\u044b\u0442\u044c \u0440\u0430\u0437\u043c\u0435\u0442\u043a\u0443' : '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0440\u0430\u0437\u043c\u0435\u0442\u043a\u0443';
  inductiveVisibilityButton.setAttribute('aria-label', inductiveVisibilityButton.title);
  inductiveVisibilityButton.setAttribute('aria-pressed', String(!inductiveMarksVisible));
}

function inductiveAnnotationInput(annotation) {
  return {
    module:annotation.module,
    bookIndex:Number(annotation.bookIndex),
    chapter:Number(annotation.chapter),
    verse:Number(annotation.verse),
    startOffset:Number(annotation.startOffset),
    endOffset:Number(annotation.endOffset),
    quote:annotation.quote,
    prefix:annotation.prefix || undefined,
    suffix:annotation.suffix || undefined,
    textHash:annotation.textHash || undefined,
    styleId:annotation.styleId,
    note:annotation.note || undefined
  };
}

function inductiveRelationInput(relation) {
  return {
    module:relation.module,
    bookIndex:Number(relation.bookIndex),
    chapter:Number(relation.chapter),
    source:{
      verse:Number(relation.sourceVerse),
      startOffset:Number(relation.sourceStartOffset),
      endOffset:Number(relation.sourceEndOffset),
      quote:relation.sourceQuote,
      prefix:relation.sourcePrefix || undefined,
      suffix:relation.sourceSuffix || undefined,
      textHash:relation.sourceTextHash || undefined
    },
    target:{
      verse:Number(relation.targetVerse),
      startOffset:Number(relation.targetStartOffset),
      endOffset:Number(relation.targetEndOffset),
      quote:relation.targetQuote,
      prefix:relation.targetPrefix || undefined,
      suffix:relation.targetSuffix || undefined,
      textHash:relation.targetTextHash || undefined
    },
    type:relation.type,
    note:relation.note || undefined
  };
}

function inductiveRelationEndpoint(selection) {
  return {
    verse:Number(selection.verse),
    startOffset:Number(selection.startOffset),
    endOffset:Number(selection.endOffset),
    quote:selection.quote,
    prefix:selection.fullText?.slice(Math.max(0, selection.startOffset - 30), selection.startOffset) || selection.prefix || undefined,
    suffix:selection.fullText?.slice(selection.endOffset, selection.endOffset + 30) || selection.suffix || undefined,
    textHash:selection.textHash || undefined
  };
}

function upsertInductiveRelation(relation) {
  inductiveRelations = [
    ...inductiveRelations.filter(item => item.id !== relation.id),
    relation
  ];
}

function removeInductiveRelationFromState(id) {
  inductiveRelations = inductiveRelations.filter(relation => relation.id !== id);
  inductiveActiveRelationIds = inductiveActiveRelationIds.filter(relationId => relationId !== id);
  if (inductiveActiveRelationIds.length === 0) inductiveActiveRelationAnchorIds = [];
  if (inductiveRelationEditingId === id) inductiveRelationEditingId = null;
}

function inductiveWordCharacter(character) {
  return Boolean(character) && /[\p{L}\p{N}\p{M}]/u.test(character);
}

function expandInductiveSelectionToWordBoundaries(text, startOffset, endOffset) {
  let start = Math.max(0, Math.min(Number(startOffset), text.length));
  let end = Math.max(start, Math.min(Number(endOffset), text.length));
  while (start > 0 && inductiveWordCharacter(text[start]) && inductiveWordCharacter(text[start - 1])) start -= 1;
  while (end < text.length && inductiveWordCharacter(text[end]) && inductiveWordCharacter(text[end - 1])) end += 1;
  return { startOffset:start, endOffset:end, quote:text.slice(start, end) };
}

function inductiveWordAtPoint(text, offset) {
  let position = Math.max(0, Math.min(Number(offset), text.length - 1));
  if (!inductiveWordCharacter(text[position]) && position > 0 && inductiveWordCharacter(text[position - 1])) position -= 1;
  if (!inductiveWordCharacter(text[position])) return null;
  let startOffset = position;
  let endOffset = position + 1;
  while (startOffset > 0 && inductiveWordCharacter(text[startOffset - 1])) startOffset -= 1;
  while (endOffset < text.length && inductiveWordCharacter(text[endOffset])) endOffset += 1;
  return { startOffset, endOffset, quote:text.slice(startOffset, endOffset) };
}

function inductiveRangesAreJoinable(text, leftEnd, rightStart) {
  if (rightStart <= leftEnd) return true;
  return ![...text.slice(leftEnd, rightStart)].some(inductiveWordCharacter);
}

function coalesceInductiveAnnotations(annotations, text) {
  const groupsByStyle = new Map();
  for (const annotation of [...annotations].sort((a, b) => Number(a.startOffset) - Number(b.startOffset))) {
    const groups = groupsByStyle.get(annotation.styleId) || [];
    const previous = groups[groups.length - 1];
    const start = Number(annotation.startOffset);
    const end = Number(annotation.endOffset);
    if (previous && inductiveRangesAreJoinable(text, Number(previous.endOffset), start)) {
      previous.endOffset = Math.max(Number(previous.endOffset), end);
      previous.quote = text.slice(Number(previous.startOffset), Number(previous.endOffset));
      previous.sourceIds.push(annotation.id);
    } else {
      groups.push({ ...annotation, sourceIds:[annotation.id] });
    }
    groupsByStyle.set(annotation.styleId, groups);
  }
  return [...groupsByStyle.values()].flat().sort((a, b) => Number(a.startOffset) - Number(b.startOffset));
}

function inductiveTextElementFromNode(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest?.('[data-inductive-text="true"]') || null;
}

function inductiveSelectionOffsets(textElement, range) {
  const startRange = document.createRange();
  startRange.selectNodeContents(textElement);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = document.createRange();
  endRange.selectNodeContents(textElement);
  endRange.setEnd(range.endContainer, range.endOffset);
  return {
    startOffset:startRange.toString().length,
    endOffset:endRange.toString().length
  };
}

function hideInductivePopover() {
  if (inductivePopover) inductivePopover.hidden = true;
  inductiveSelection = null;
}

function ensureInductivePopover() {
  if (inductivePopover) return inductivePopover;
  const popover = document.createElement('div');
  popover.className = 'inductive-selection-popover';
  popover.hidden = true;
  document.body.append(popover);
  inductivePopover = popover;
  return popover;
}

function renderInductivePopover(rect) {
  const popover = ensureInductivePopover();
  popover.replaceChildren();
  const markingTitle = document.createElement('strong');
  markingTitle.className = 'inductive-popover-section-title';
  markingTitle.textContent = 'Отметить как';
  const styles = inductiveStyles.filter(style => !inductiveLegacyRelationStyleIds.has(style.id)).slice(0, 12);
  const palette = document.createElement('div');
  palette.className = 'inductive-popover-palette';
  for (const style of styles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inductive-popover-style';
    button.title = style.name;
    button.style.setProperty('--inductive-color', style.color);
    button.style.setProperty('--inductive-background', style.backgroundColor);
    const symbol = document.createElement('strong');
    symbol.textContent = style.symbol;
    const name = document.createElement('span');
    name.textContent = style.name;
    button.append(symbol, name);
    button.addEventListener('click', () => createInductiveMarks(style.id).catch(showError));
    palette.append(button);
  }
  const options = document.createElement('div');
  options.className = 'inductive-popover-options';
  const allLabel = document.createElement('label');
  const allInput = document.createElement('input');
  allInput.type = 'checkbox';
  allInput.checked = false;
  allInput.dataset.inductiveAll = 'true';
  allLabel.append(allInput, document.createTextNode(' Все совпадения в главе'));
  const hint = document.createElement('small');
  hint.className = 'inductive-popover-hint';
  hint.textContent = '\u041e\u0442\u043c\u0435\u0442\u0438\u0442\u044c \u044d\u0442\u043e \u0442\u043e\u0447\u043d\u043e\u0435 \u0441\u043b\u043e\u0432\u043e \u0438\u043b\u0438 \u0444\u0440\u0430\u0437\u0443 \u0432\u043e \u0432\u0441\u0435\u0445 \u0441\u0442\u0438\u0445\u0430\u0445 \u0433\u043b\u0430\u0432\u044b, \u0431\u0435\u0437 \u0443\u0447\u0451\u0442\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430.';
  options.append(allLabel, hint);
  const relationTitle = document.createElement('strong');
  relationTitle.className = 'inductive-popover-section-title relation-title';
  relationTitle.textContent = 'Связать с другим фрагментом';
  const relations = document.createElement('div');
  relations.className = 'inductive-popover-relations';
  for (const type of inductiveAvailableRelationTypes) {
    const definition = inductiveRelationType(type);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inductive-popover-relation';
    button.dataset.type = type;
    const symbol = document.createElement('strong');
    symbol.textContent = definition.symbol;
    const name = document.createElement('span');
    name.textContent = definition.name;
    button.append(symbol, name);
    button.addEventListener('click', () => beginInductiveRelationFromSelection(type));
    relations.append(button);
  }
  popover.append(markingTitle, palette, options, relationTitle, relations);
  popover.hidden = false;
  const width = Math.min(520, window.innerWidth - 20);
  popover.style.width = width + 'px';
  const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left + rect.width / 2 - width / 2));
  const top = Math.max(10, rect.top - popover.offsetHeight - 10);
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
}

function beginInductiveRelationFromSelection(type) {
  if (!inductiveSelection || !inductiveAvailableRelationTypes.includes(type)) return;
  inductiveRelationDraft = {
    type,
    module:inductiveSelection.module,
    bookIndex:inductiveSelection.bookIndex,
    chapter:inductiveSelection.chapter,
    source:inductiveRelationEndpoint(inductiveSelection)
  };
  hideInductivePopover();
  window.getSelection()?.removeAllRanges();
  refreshInductiveRendering();
}

function handleInductiveTextSelection(event) {
  if (!inductiveMode) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const startElement = inductiveTextElementFromNode(range.startContainer);
  const endElement = inductiveTextElementFromNode(range.endContainer);
  if (!startElement || startElement !== endElement) return;
  const rawOffsets = inductiveSelectionOffsets(startElement, range);
  const fullText = startElement.textContent || '';
  const offsets = expandInductiveSelectionToWordBoundaries(fullText, rawOffsets.startOffset, rawOffsets.endOffset);
  const quote = offsets.quote;
  if (!quote.trim()) return;
  inductiveSelection = {
    module:startElement.dataset.module,
    bookIndex:Number(startElement.dataset.bookIndex),
    chapter:Number(startElement.dataset.chapter),
    verse:Number(startElement.dataset.verse),
    startOffset:offsets.startOffset,
    endOffset:offsets.endOffset,
    quote,
    fullText
  };
  if (inductiveRelationDraft) {
    createInductiveRelationFromSelection(inductiveSelection).catch(showError);
    window.getSelection()?.removeAllRanges();
    event.stopPropagation();
    return;
  }
  renderInductivePopover(range.getBoundingClientRect());
  event.stopPropagation();
}

function inductiveInputForRange(selection, styleId, startOffset, endOffset, quote) {
  return {
    module:selection.module,
    bookIndex:selection.bookIndex,
    chapter:selection.chapter,
    verse:selection.verse,
    startOffset,
    endOffset,
    quote,
    prefix:selection.fullText.slice(Math.max(0, startOffset - 30), startOffset),
    suffix:selection.fullText.slice(endOffset, endOffset + 30),
    styleId
  };
}

function allInductiveOccurrences(selection, styleId) {
  const results = [];
  const needle = selection.quote.toLocaleLowerCase();
  const requireStartBoundary = inductiveWordCharacter(selection.quote[0]);
  const requireEndBoundary = inductiveWordCharacter(selection.quote[selection.quote.length - 1]);
  for (const [verse, fullText] of inductiveVerseTextByVerse) {
    const haystack = fullText.toLocaleLowerCase();
    let cursor = 0;
    while (cursor <= haystack.length - needle.length) {
      const index = haystack.indexOf(needle, cursor);
      if (index < 0) break;
      const hasStartBoundary = !requireStartBoundary || !inductiveWordCharacter(fullText[index - 1]);
      const hasEndBoundary = !requireEndBoundary || !inductiveWordCharacter(fullText[index + selection.quote.length]);
      if (!hasStartBoundary || !hasEndBoundary) {
        cursor = index + 1;
        continue;
      }
      results.push(inductiveInputForRange({
        ...selection,
        verse,
        fullText
      }, styleId, index, index + selection.quote.length, fullText.slice(index, index + selection.quote.length)));
      cursor = index + Math.max(1, needle.length);
    }
  }
  return results;
}

async function createInductiveMarks(styleId) {
  if (!inductiveSelection) return;
  const selection = inductiveSelection;
  const markAll = Boolean(inductivePopover?.querySelector('[data-inductive-all="true"]')?.checked);
  const annotations = markAll
    ? allInductiveOccurrences(selection, styleId)
    : [inductiveInputForRange(selection, styleId, selection.startOffset, selection.endOffset, selection.quote)];
  const existingIds = new Set(inductiveAnnotations.map(annotation => annotation.id));
  const result = await api('/api/inductive/annotations', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ annotations })
  });
  const created = Array.isArray(result.annotations) ? result.annotations : [];
  const createdIds = new Set(created.map(annotation => annotation.id));
  const newAnnotations = created.filter(annotation => !existingIds.has(annotation.id));
  inductiveAnnotations = [
    ...inductiveAnnotations.filter(annotation => !createdIds.has(annotation.id)),
    ...created
  ];
  if (newAnnotations.length > 0) {
    pushInductiveUndoAction({
      kind:'annotations-create',
      ids:newAnnotations.map(annotation => annotation.id),
      annotations:newAnnotations.map(inductiveAnnotationInput)
    });
  }
  updateInductiveActionButtons();
  window.getSelection()?.removeAllRanges();
  hideInductivePopover();
  refreshInductiveRendering();
}

async function deleteInductiveMark(id, rememberForUndo = false) {
  const annotation = inductiveAnnotations.find(item => item.id === id);
  await api('/api/inductive/annotations/' + encodeURIComponent(id), { method:'DELETE' });
  inductiveAnnotations = inductiveAnnotations.filter(item => item.id !== id);
  if (!rememberForUndo) {
    clearInductiveHistory();
  }
  updateInductiveActionButtons();
  refreshInductiveRendering();
  return annotation;
}

async function undoInductiveMarks() {
  const action = inductiveUndoStack[inductiveUndoStack.length - 1];
  if (!action) return;
  if (action.kind === 'annotations-create') {
    const ids = [...(action.ids || [])];
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await Promise.all(ids.map(id => api('/api/inductive/annotations/' + encodeURIComponent(id), { method:'DELETE' })));
    inductiveAnnotations = inductiveAnnotations.filter(annotation => !idSet.has(annotation.id));
  } else if (action.kind === 'relation-create') {
    await api('/api/inductive/relations/' + encodeURIComponent(action.relation.id), { method:'DELETE' });
    removeInductiveRelationFromState(action.relation.id);
  } else if (action.kind === 'relation-update') {
    const result = await api('/api/inductive/relations/' + encodeURIComponent(action.after.id), {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(inductiveRelationInput(action.before))
    });
    upsertInductiveRelation(result.relation);
  } else if (action.kind === 'relation-delete') {
    const deletedId = action.relation.id;
    const result = await api('/api/inductive/relations', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(inductiveRelationInput(action.relation))
    });
    rebaseInductiveRelationHistoryId(deletedId, result.relation.id);
    action.relation = result.relation;
    upsertInductiveRelation(result.relation);
  } else {
    return;
  }
  inductiveUndoStack.pop();
  inductiveRedoStack.push(action);
  updateInductiveActionButtons();
  refreshInductiveRendering();
}

async function redoInductiveMarks() {
  const action = inductiveRedoStack[inductiveRedoStack.length - 1];
  if (!action) return;
  if (action.kind === 'annotations-create') {
    const annotations = (action.annotations || []).map(annotation => ({ ...annotation }));
    if (annotations.length === 0) return;
    const result = await api('/api/inductive/annotations', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ annotations })
    });
    const restored = Array.isArray(result.annotations) ? result.annotations : [];
    const restoredIds = new Set(restored.map(annotation => annotation.id));
    inductiveAnnotations = [
      ...inductiveAnnotations.filter(annotation => !restoredIds.has(annotation.id)),
      ...restored
    ];
    action.ids = [...restoredIds];
    action.annotations = restored.map(inductiveAnnotationInput);
  } else if (action.kind === 'relation-create') {
    const deletedId = action.relation.id;
    const result = await api('/api/inductive/relations', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(inductiveRelationInput(action.relation))
    });
    rebaseInductiveRelationHistoryId(deletedId, result.relation.id);
    action.relation = result.relation;
    upsertInductiveRelation(result.relation);
  } else if (action.kind === 'relation-update') {
    const result = await api('/api/inductive/relations/' + encodeURIComponent(action.before.id), {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(inductiveRelationInput(action.after))
    });
    action.after = result.relation;
    upsertInductiveRelation(result.relation);
  } else if (action.kind === 'relation-delete') {
    await api('/api/inductive/relations/' + encodeURIComponent(action.relation.id), { method:'DELETE' });
    removeInductiveRelationFromState(action.relation.id);
  } else {
    return;
  }
  inductiveRedoStack.pop();
  inductiveUndoStack.push(action);
  if (inductiveUndoStack.length > 100) inductiveUndoStack.shift();
  updateInductiveActionButtons();
  refreshInductiveRendering();
}

function validInductiveAnnotationsForText(verse, text) {
  const valid = inductiveAnnotations.filter(annotation => {
    if (Number(annotation.verse) !== Number(verse)) return false;
    const start = Number(annotation.startOffset);
    const end = Number(annotation.endOffset);
    return start >= 0 && end <= text.length && start < end && text.slice(start, end) === annotation.quote;
  });
  return coalesceInductiveAnnotations(valid, text);
}

function inductiveObservationGroups() {
  return [...inductiveVerseTextByVerse.entries()].flatMap(([verse, text]) => validInductiveAnnotationsForText(verse, text));
}

function toggleInductiveRelationIds(relationIds) {
  const next = [...new Set(relationIds)].sort();
  const current = [...inductiveActiveRelationIds].sort();
  inductiveActiveRelationAnchorIds = [];
  inductiveActiveRelationIds = next.length > 0
    && next.length === current.length
    && next.every((id, index) => id === current[index])
    ? []
    : next;
  refreshInductiveRendering();
}

function toggleInductiveRelationsForEndpoint(anchorKeys, relationIds) {
  const nextAnchor = [...new Set(anchorKeys)].sort();
  const currentAnchor = [...inductiveActiveRelationAnchorIds].sort();
  const sameAnchor = nextAnchor.length === currentAnchor.length
    && nextAnchor.every((id, index) => id === currentAnchor[index]);
  if (sameAnchor) {
    inductiveActiveRelationAnchorIds = [];
    inductiveActiveRelationIds = [];
    refreshInductiveRendering();
    return;
  }
  inductiveActiveRelationAnchorIds = nextAnchor;
  inductiveActiveRelationIds = [...new Set(relationIds)];
  refreshInductiveRendering();
}

function handleInductiveMarkClick(event) {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return;
  if (inductiveRelationDraft) {
    const textElement = event.currentTarget;
    const caret = document.caretPositionFromPoint
      ? document.caretPositionFromPoint(event.clientX, event.clientY)
      : document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const caretNode = caret?.offsetNode || caret?.startContainer;
    const caretOffset = caret?.offset ?? caret?.startOffset;
    if (caretNode != null && Number.isInteger(caretOffset) && textElement.contains(caretNode)) {
      const range = document.createRange();
      range.setStart(caretNode, caretOffset);
      range.collapse(true);
      const offsets = inductiveSelectionOffsets(textElement, range);
      const fullText = inductiveVerseTextByVerse.get(Number(textElement.dataset.verse)) || textElement.textContent || '';
      const word = inductiveWordAtPoint(fullText, offsets.startOffset);
      if (word) {
        event.preventDefault();
        event.stopPropagation();
        createInductiveRelationFromSelection({
          module:textElement.dataset.module,
          bookIndex:Number(textElement.dataset.bookIndex),
          chapter:Number(textElement.dataset.chapter),
          verse:Number(textElement.dataset.verse),
          ...word,
          fullText
        }).catch(showError);
      }
    }
    return;
  }
  const mark = event.target?.closest?.('.inductive-relation-endpoint[data-relation-ids]');
  if (!mark) return;
  const relationIds = String(mark.dataset.relationIds || '').split(',').filter(Boolean);
  const anchorKeys = String(mark.dataset.relationAnchors || '').split(',').filter(Boolean);
  event.stopPropagation();
  toggleInductiveRelationsForEndpoint(anchorKeys, relationIds);
}

async function createInductiveRelationFromSelection(selection) {
  if (!inductiveRelationDraft) return;
  const draft = inductiveRelationDraft;
  inductiveRelationDraft = null;
  const relationsBeforeRequest = new Map(inductiveRelations.map(relation => [relation.id, { ...relation }]));
  const fullText = selection.fullText || inductiveVerseTextByVerse.get(Number(selection.verse)) || '';
  const normalizedTarget = expandInductiveSelectionToWordBoundaries(
    fullText,
    selection.startOffset,
    selection.endOffset
  );
  const input = {
    module:draft.module,
    bookIndex:draft.bookIndex,
    chapter:draft.chapter,
    source:draft.source,
    target:inductiveRelationEndpoint({ ...selection, ...normalizedTarget }),
    type:draft.type
  };
  let result;
  try {
    result = await api('/api/inductive/relations', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(input)
    });
  } catch (error) {
    if (!inductiveRelationDraft) inductiveRelationDraft = draft;
    refreshInductiveRendering();
    throw error;
  }
  const relation = result.relation;
  upsertInductiveRelation(relation);
  const previous = relationsBeforeRequest.get(relation.id);
  pushInductiveUndoAction(previous
    ? { kind:'relation-update', before:previous, after:{ ...relation } }
    : { kind:'relation-create', relation:{ ...relation } });
  inductiveSelection = null;
  inductiveJustCreatedRelationId = relation.id;
  inductiveActiveRelationIds = [relation.id];
  inductiveActiveRelationAnchorIds = [];
  updateInductiveActionButtons();
  refreshInductiveRendering();
}

async function deleteInductiveRelation(id) {
  const relation = inductiveRelations.find(item => item.id === id);
  if (!relation) return;
  await api('/api/inductive/relations/' + encodeURIComponent(id), { method:'DELETE' });
  removeInductiveRelationFromState(id);
  if (inductiveJustCreatedRelationId === id) inductiveJustCreatedRelationId = null;
  pushInductiveUndoAction({ kind:'relation-delete', relation:{ ...relation } });
  refreshInductiveRendering();
}

async function updateInductiveRelationFromForm(form, relation) {
  const data = new FormData(form);
  const before = { ...relation };
  const input = {
    module:relation.module,
    bookIndex:Number(relation.bookIndex),
    chapter:Number(relation.chapter),
    source:form.inductiveSource,
    target:form.inductiveTarget,
    type:data.get('type'),
    note:data.get('note') || undefined
  };
  const result = await api('/api/inductive/relations/' + encodeURIComponent(relation.id), {
    method:'PATCH',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(input)
  });
  upsertInductiveRelation(result.relation);
  pushInductiveUndoAction({ kind:'relation-update', before, after:{ ...result.relation } });
  inductiveRelationEditingId = null;
  updateInductiveActionButtons();
  refreshInductiveRendering();
}

function validInductiveRelationEndpointsForText(verse, text) {
  const endpoints = [];
  for (const relation of inductiveRelations) {
    for (const side of ['source', 'target']) {
      const endpointVerse = Number(relation[side + 'Verse']);
      const startOffset = Number(relation[side + 'StartOffset']);
      const endOffset = Number(relation[side + 'EndOffset']);
      const quote = relation[side + 'Quote'];
      if (endpointVerse !== Number(verse)
        || startOffset < 0
        || endOffset > text.length
        || startOffset >= endOffset
        || text.slice(startOffset, endOffset) !== quote) continue;
      endpoints.push({
        relation,
        side,
        key:relation.id + ':' + side,
        startOffset,
        endOffset,
        quote,
        type:relation.type,
        pending:false
      });
    }
  }
  if (inductiveRelationDraft && Number(inductiveRelationDraft.source.verse) === Number(verse)) {
    const source = inductiveRelationDraft.source;
    if (source.startOffset >= 0
      && source.endOffset <= text.length
      && source.startOffset < source.endOffset
      && text.slice(source.startOffset, source.endOffset) === source.quote) {
      endpoints.push({
        relation:null,
        side:'source',
        key:'pending:source',
        startOffset:source.startOffset,
        endOffset:source.endOffset,
        quote:source.quote,
        type:inductiveRelationDraft.type,
        pending:true
      });
    }
  }
  return endpoints;
}

function renderInductiveText(textElement, verse, text) {
  textElement.replaceChildren();
  if (!inductiveMarksVisible) {
    textElement.textContent = text;
    return;
  }
  const annotations = validInductiveAnnotationsForText(verse, text);
  const relationEndpoints = validInductiveRelationEndpointsForText(verse, text);
  if (annotations.length === 0 && relationEndpoints.length === 0) {
    textElement.textContent = text;
    return;
  }
  const boundaries = new Set([0, text.length]);
  annotations.forEach(annotation => {
    boundaries.add(Number(annotation.startOffset));
    boundaries.add(Number(annotation.endOffset));
  });
  relationEndpoints.forEach(endpoint => {
    boundaries.add(endpoint.startOffset);
    boundaries.add(endpoint.endOffset);
  });
  const points = [...boundaries].sort((a, b) => a - b);
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const active = annotations.filter(annotation => Number(annotation.startOffset) <= start && Number(annotation.endOffset) >= end);
    const activeEndpoints = relationEndpoints.filter(endpoint => endpoint.startOffset <= start && endpoint.endOffset >= end);
    const value = text.slice(start, end);
    if (active.length === 0 && activeEndpoints.length === 0) {
      textElement.append(document.createTextNode(value));
      continue;
    }
    const mark = document.createElement('span');
    mark.className = 'inductive-text-segment';
    const titleParts = [];
    if (active.length > 0) {
      const primary = active[active.length - 1];
      const style = inductiveStyleForAnnotation(primary);
      mark.classList.add('inductive-mark');
      mark.dataset.decoration = style.decoration;
      mark.dataset.annotationIds = active.flatMap(annotation => annotation.sourceIds || [annotation.id]).join(',');
      if (Number(primary.startOffset) === start) mark.dataset.symbol = style.symbol;
      mark.style.setProperty('--inductive-color', style.color);
      mark.style.setProperty('--inductive-background', style.backgroundColor);
      titleParts.push(...active.map(annotation => inductiveStyleForAnnotation(annotation).name));
    }
    if (activeEndpoints.length > 0) {
      const persisted = activeEndpoints.filter(endpoint => endpoint.relation);
      mark.classList.add('inductive-relation-endpoint');
      for (const endpoint of activeEndpoints) mark.classList.add('relation-type-' + endpoint.type);
      mark.classList.toggle('relation-pending', activeEndpoints.some(endpoint => endpoint.pending));
      mark.classList.toggle('relation-active', persisted.some(endpoint => inductiveActiveRelationIds.includes(endpoint.relation.id)));
      mark.dataset.relationIds = [...new Set(persisted.map(endpoint => endpoint.relation.id))].join(',');
      mark.dataset.relationAnchors = [...new Set(persisted.map(endpoint => endpoint.key))].join(',');
      const startingEndpoints = activeEndpoints.filter(endpoint => endpoint.startOffset === start);
      if (startingEndpoints.length > 0) {
        mark.dataset.relations = [...new Set(startingEndpoints.map(inductiveRelationEndpointBadge))].join('·');
      }
      titleParts.push(...activeEndpoints.map(inductiveRelationEndpointTitle));
    }
    mark.title = [...new Set(titleParts)].join(', ');
    mark.textContent = value;
    textElement.append(mark);
  }
}

function prepareInductiveTextElement(textElement, result, verse, text) {
  textElement.dataset.inductiveText = 'true';
  textElement.dataset.module = result.module || bibleReaderModuleEl.value || currentBibleModule();
  textElement.dataset.bookIndex = String(result.bookIndex || Number(bibleReaderBookEl.value));
  textElement.dataset.chapter = String(verse.chapter);
  textElement.dataset.verse = String(verse.verse);
  textElement.addEventListener('mouseup', handleInductiveTextSelection);
  textElement.addEventListener('click', handleInductiveMarkClick);
  renderInductiveText(textElement, verse.verse, text);
}

function refreshInductiveRendering() {
  document.querySelectorAll('[data-inductive-text="true"]').forEach(textElement => {
    const verse = Number(textElement.dataset.verse);
    const text = inductiveVerseTextByVerse.get(verse) ?? textElement.textContent ?? '';
    renderInductiveText(textElement, verse, text);
  });
  renderInductiveObservations();
}

function createInductiveRelationEditor(relation = null) {
  if (!relation) return null;
  const relationInput = inductiveRelationInput(relation);
  const form = document.createElement('form');
  form.className = 'inductive-relation-form';
  form.dataset.mode = 'edit';
  form.inductiveSource = { ...relationInput.source };
  form.inductiveTarget = { ...relationInput.target };
  const heading = document.createElement('strong');
  const type = document.createElement('select');
  type.name = 'type';
  type.setAttribute('aria-label', 'Тип связи');
  const editableTypes = relation.type === 'conclusion'
    ? ['conclusion', ...inductiveAvailableRelationTypes]
    : inductiveAvailableRelationTypes;
  for (const value of editableTypes) {
    const definition = inductiveRelationType(value);
    const option = document.createElement('option');
    option.value = value;
    option.textContent = definition.symbol + ' ' + definition.name;
    type.append(option);
  }
  type.value = relation.type;
  const note = document.createElement('input');
  note.name = 'note';
  note.maxLength = 500;
  note.placeholder = 'Комментарий к связи (необязательно)';
  note.value = relation.note || '';
  const actions = document.createElement('div');
  actions.className = 'inductive-relation-form-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Отмена';
  const reverse = document.createElement('button');
  reverse.type = 'button';
  reverse.className = 'inductive-relation-reverse';
  reverse.textContent = 'Поменять направление';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Сохранить';
  function syncForm() {
    const arrow = ['cause', 'conclusion'].includes(type.value) ? ' → ' : ' — ';
    heading.textContent = 'Изменить связь: '
      + '«' + form.inductiveSource.quote + '»' + arrow + '«' + form.inductiveTarget.quote + '»';
    reverse.disabled = !['cause', 'conclusion'].includes(type.value);
    reverse.title = reverse.disabled
      ? 'У этого типа связи нет направления'
      : 'Поменять местами начало и конец связи';
  }
  type.addEventListener('change', syncForm);
  reverse.addEventListener('click', () => {
    [form.inductiveSource, form.inductiveTarget] = [form.inductiveTarget, form.inductiveSource];
    syncForm();
  });
  cancel.addEventListener('click', () => {
    inductiveRelationEditingId = null;
    renderInductiveObservations();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    updateInductiveRelationFromForm(form, relation).catch(showError);
  });
  actions.append(cancel, reverse, submit);
  form.append(heading, type, note, actions);
  syncForm();
  return form;
}

function renderInductiveObservations() {
  if (!inductiveObservationsPanel) return;
  const workspace = inductiveObservationsPanel.closest('.inductive-reader-workspace');
  inductiveObservationsPanel.classList.toggle('collapsed', inductivePanelCollapsed);
  workspace?.classList.toggle('panel-collapsed', inductivePanelCollapsed);
  inductiveObservationsPanel.replaceChildren();
  const header = document.createElement('div');
  header.className = 'inductive-panel-header';
  const heading = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Наблюдения';
  const allObservationGroups = inductiveObservationGroups();
  const observationGroups = inductiveObservationStyleFilter
    ? allObservationGroups.filter(annotation => annotation.styleId === inductiveObservationStyleFilter)
    : allObservationGroups;
  const relationCount = inductiveRelations.length;
  const allObservationCount = allObservationGroups.length + relationCount;
  const visibleObservationCount = observationGroups.length + relationCount;
  const count = document.createElement('span');
  count.textContent = inductiveObservationStyleFilter
    ? visibleObservationCount + '/' + allObservationCount
    : String(allObservationCount);
  count.title = inductiveObservationStyleFilter
    ? 'Показано наблюдений / всего в главе; фильтр применяется только к отметкам'
    : 'Количество отметок и связей в главе';
  count.setAttribute('aria-label', inductiveObservationStyleFilter
    ? 'Показано наблюдений: ' + visibleObservationCount + ' из ' + allObservationCount
    : 'Наблюдений в главе: ' + allObservationCount);
  heading.append(title, count);
  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.className = 'inductive-panel-toggle';
  collapseButton.textContent = inductivePanelCollapsed ? '‹' : 'Свернуть ›';
  collapseButton.title = inductivePanelCollapsed ? 'Развернуть панель наблюдений' : 'Свернуть панель наблюдений вправо';
  collapseButton.setAttribute('aria-label', collapseButton.title);
  collapseButton.addEventListener('click', () => {
    inductivePanelCollapsed = !inductivePanelCollapsed;
    localStorage.setItem('biblenote.inductive.panelCollapsed', inductivePanelCollapsed ? '1' : '0');
    renderInductiveObservations();
  });
  header.append(heading, collapseButton);
  if (inductivePanelCollapsed) {
    inductiveObservationsPanel.append(header);
    return;
  }

  const paletteTitle = document.createElement('div');
  paletteTitle.className = 'inductive-section-title';
  paletteTitle.textContent = 'Отметки';
  const palette = document.createElement('div');
  palette.className = 'inductive-side-palette';
  for (const style of inductiveStyles.filter(style => !inductiveLegacyRelationStyleIds.has(style.id))) {
    const entry = document.createElement('div');
    entry.className = 'inductive-side-style-entry';
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'inductive-side-style';
    item.style.setProperty('--inductive-color', style.color);
    item.style.setProperty('--inductive-background', style.backgroundColor);
    const selected = inductiveObservationStyleFilter === style.id;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
    item.title = selected
      ? '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0432\u0441\u0435 \u043e\u0442\u043c\u0435\u0442\u043a\u0438'
      : '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043e\u0442\u043c\u0435\u0442\u043a\u0438 \u00ab' + style.name + '\u00bb';
    const symbol = document.createElement('strong');
    symbol.textContent = style.symbol;
    const name = document.createElement('span');
    name.textContent = style.name;
    item.append(symbol, name);
    item.addEventListener('click', () => {
      inductiveObservationStyleFilter = selected ? null : style.id;
      renderInductiveObservations();
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'inductive-side-style-edit';
    edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    edit.title = 'Изменить стиль «' + style.name + '»';
    edit.setAttribute('aria-label', edit.title);
    edit.addEventListener('click', () => showInductiveStyleForm(entry, style));
    entry.append(item, edit);
    palette.append(entry);
  }
  const addStyleButton = document.createElement('button');
  addStyleButton.type = 'button';
  addStyleButton.className = 'inductive-add-style';
  addStyleButton.textContent = '+ Своё ключевое слово';
  addStyleButton.addEventListener('click', () => showInductiveStyleForm(addStyleButton));
  palette.append(addStyleButton);

  const listTitle = document.createElement('div');
  listTitle.className = 'inductive-section-title';
  listTitle.textContent = 'Отмечено в главе';
  const list = document.createElement('div');
  list.className = 'inductive-observation-list';
  if (observationGroups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'inductive-empty';
    empty.textContent = inductiveObservationStyleFilter
      ? 'В этой главе нет отметок с таким стилем.'
      : inductiveMode
        ? 'Выделите слово или фразу в тексте.'
        : 'Включите режим «Разметка» над текстом.';
    list.append(empty);
  } else {
    const sorted = observationGroups.sort((a, b) => Number(a.verse) - Number(b.verse) || Number(a.startOffset) - Number(b.startOffset));
    for (const annotation of sorted) {
      const style = inductiveStyleForAnnotation(annotation);
      const row = document.createElement('div');
      row.className = 'inductive-observation-row';
      row.style.setProperty('--inductive-color', style.color);
      row.style.setProperty('--inductive-background', style.backgroundColor);
      const marker = document.createElement('strong');
      marker.className = 'inductive-observation-symbol';
      marker.textContent = style.symbol;
      const body = document.createElement('button');
      body.type = 'button';
      body.className = 'inductive-observation-body';
      const meta = document.createElement('small');
      meta.textContent = annotation.verse + ' · ' + style.name;
      const quote = document.createElement('span');
      quote.textContent = annotation.quote;
      body.append(meta, quote);
      row.addEventListener('click', () => {
        const verseRow = document.getElementById('bible-verse-' + annotation.chapter + '-' + annotation.verse);
        if (verseRow) selectBibleReaderVerse(verseRow, annotation.verse);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'inductive-remove';
      remove.textContent = '×';
      remove.title = 'Удалить отметку';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        Promise.all((annotation.sourceIds || [annotation.id]).map(id => deleteInductiveMark(id, true)))
          .then(() => {
            clearInductiveHistory();
            updateInductiveActionButtons();
            refreshInductiveRendering();
          })
          .catch(showError);
      });
      row.append(marker, body, remove);
      list.append(row);
    }
  }

  const relationControls = [];
  if (inductiveRelationDraft) {
    const status = document.createElement('div');
    status.className = 'inductive-relation-status';
    const statusText = document.createElement('span');
    const definition = inductiveRelationType(inductiveRelationDraft.type);
    statusText.textContent = definition.symbol + ' ' + definition.name
      + ': нажмите на второе слово или выделите фразу для связи с «' + inductiveRelationDraft.source.quote + '».';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', () => {
      inductiveRelationDraft = null;
      refreshInductiveRendering();
    });
    status.append(statusText, cancel);
    relationControls.push(status);
  }
  const justCreated = inductiveRelations.find(relation => relation.id === inductiveJustCreatedRelationId);
  if (justCreated) {
    const status = document.createElement('div');
    status.className = 'inductive-relation-status created';
    const statusText = document.createElement('span');
    statusText.textContent = 'Связь «' + inductiveRelationType(justCreated.type).name + '» сохранена.';
    const actions = document.createElement('div');
    const comment = document.createElement('button');
    comment.type = 'button';
    comment.textContent = 'Добавить комментарий';
    comment.addEventListener('click', () => {
      inductiveRelationEditingId = justCreated.id;
      inductiveJustCreatedRelationId = null;
      renderInductiveObservations();
    });
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Готово';
    done.addEventListener('click', () => {
      inductiveJustCreatedRelationId = null;
      renderInductiveObservations();
    });
    actions.append(comment, done);
    status.append(statusText, actions);
    relationControls.push(status);
  }

  const relationsTitle = document.createElement('div');
  relationsTitle.className = 'inductive-section-title';
  relationsTitle.textContent = 'Связи в главе';
  const relationsList = document.createElement('div');
  relationsList.className = 'inductive-relation-list';
  if (inductiveRelations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'inductive-empty';
    empty.textContent = 'Выделите первый фрагмент и выберите тип связи в палитре.';
    relationsList.append(empty);
  } else {
    for (const relation of inductiveRelations) {
      const definition = inductiveRelationType(relation.type);
      const row = document.createElement('div');
      row.className = 'inductive-relation-row';
      row.dataset.relationId = relation.id;
      row.classList.toggle('active', inductiveActiveRelationIds.includes(relation.id));
      const symbol = document.createElement('strong');
      symbol.textContent = definition.symbol;
      symbol.title = definition.name;
      const endpoints = document.createElement('div');
      endpoints.className = 'inductive-relation-endpoints';
      const source = document.createElement('button');
      source.type = 'button';
      source.textContent = relation.sourceVerse + ' · ' + relation.sourceQuote;
      source.addEventListener('click', () => {
        const verseRow = document.getElementById('bible-verse-' + relation.chapter + '-' + relation.sourceVerse);
        if (verseRow) selectBibleReaderVerse(verseRow, relation.sourceVerse);
        toggleInductiveRelationsForEndpoint([relation.id + ':source'], [relation.id]);
      });
      const target = document.createElement('button');
      target.type = 'button';
      target.textContent = relation.targetVerse + ' · ' + relation.targetQuote;
      target.addEventListener('click', () => {
        const verseRow = document.getElementById('bible-verse-' + relation.chapter + '-' + relation.targetVerse);
        if (verseRow) selectBibleReaderVerse(verseRow, relation.targetVerse);
        toggleInductiveRelationsForEndpoint([relation.id + ':target'], [relation.id]);
      });
      endpoints.append(source, target);
      if (relation.note) {
        const note = document.createElement('small');
        note.textContent = relation.note;
        endpoints.append(note);
      }
      const rowActions = document.createElement('div');
      rowActions.className = 'inductive-relation-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'inductive-relation-edit';
      edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
      edit.title = 'Изменить связь';
      edit.setAttribute('aria-label', edit.title);
      edit.addEventListener('click', () => {
        inductiveRelationEditingId = inductiveRelationEditingId === relation.id ? null : relation.id;
        renderInductiveObservations();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'inductive-remove inductive-relation-delete';
      remove.textContent = '×';
      remove.title = 'Удалить связь';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        remove.disabled = true;
        deleteInductiveRelation(relation.id).catch(error => {
          remove.disabled = false;
          showError(error);
        });
      });
      rowActions.append(edit, remove);
      row.append(symbol, endpoints, rowActions);
      relationsList.append(row);
      if (inductiveRelationEditingId === relation.id) {
        relationsList.append(createInductiveRelationEditor(relation));
      }
    }
  }
  inductiveObservationsPanel.append(header, paletteTitle, palette, listTitle, list, ...relationControls, relationsTitle, relationsList);
}

function showInductiveStyleForm(_anchor, style = null) {
  const palette = inductiveObservationsPanel?.querySelector('.inductive-side-palette');
  if (!palette) return;
  inductiveObservationsPanel.querySelector('.inductive-style-form')?.remove();
  const form = document.createElement('form');
  form.className = 'inductive-style-form';
  form.innerHTML = '<strong class="inductive-style-form-title">' + (style ? 'Изменить стиль' : 'Новый стиль') + '</strong>'
    + '<input name="name" maxlength="60" placeholder="Например, Завет" required>'
    + '<div><input name="symbol" maxlength="4" aria-label="Символ" required>'
    + '<input name="color" type="color" aria-label="Цвет текста">'
    + '<input name="backgroundColor" type="color" aria-label="Цвет фона"></div>'
    + '<select name="decoration"><option value="highlight">Выделение</option><option value="box">Рамка</option>'
    + '<option value="double">Двойное подчёркивание</option><option value="wavy">Волнистая линия</option>'
    + '<option value="dashed">Пунктир</option></select><div class="inductive-style-form-actions">'
    + '<button type="button" data-cancel>Отмена</button><button type="submit">' + (style ? 'Сохранить' : 'Добавить') + '</button></div>';
  form.elements.name.value = style?.name || '';
  form.elements.symbol.value = style?.symbol || '◆';
  form.elements.color.value = style?.color || '#6d5200';
  form.elements.backgroundColor.value = style?.backgroundColor || '#f6df88';
  form.elements.decoration.value = style?.decoration || 'highlight';
  palette.after(form);
  form.querySelector('[data-cancel]').addEventListener('click', () => form.remove());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const result = await api(style ? '/api/inductive/styles/' + encodeURIComponent(style.id) : '/api/inductive/styles', {
      method:style ? 'PATCH' : 'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(Object.fromEntries(data.entries()))
    });
    if (style) {
      inductiveStyles = inductiveStyles.map(item => item.id === result.style.id ? result.style : item);
    } else {
      inductiveStyles.push(result.style);
    }
    form.remove();
    refreshInductiveRendering();
  });
  form.elements.name.focus();
}

function exportInductiveChapter() {
  const location = currentBibleReaderLocation();
  const payload = {
    format:'biblenote-inductive-markings',
    version:2,
    exportedAt:new Date().toISOString(),
    location:{ module:location.module, bookIndex:location.bookIndex, book:location.book?.name, chapter:location.chapter },
    styles:inductiveStyles,
    annotations:inductiveAnnotations,
    relations:inductiveRelations.map(relation => ({ id:relation.id, ...inductiveRelationInput(relation) }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'BibleNote-' + (location.book?.shortName || location.book?.name || 'Bible') + '-' + location.chapter + '-markings.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function importInductiveChapterFile(file) {
  if (!file) return;
  if (file.size > 75_000_000) throw new Error('Файл импорта слишком большой.');
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('Не удалось прочитать JSON-файл разметки.');
  }
  if (payload?.format !== 'biblenote-inductive-markings' || ![1, 2].includes(payload?.version)) {
    throw new Error('Это не файл индуктивной разметки BibleNote поддерживаемой версии.');
  }
  if (importInductiveMarkingsStatus) importInductiveMarkingsStatus.textContent = 'Импорт разметки…';
  if (importInductiveMarkingsButton) importInductiveMarkingsButton.disabled = true;
  try {
    const result = await api('/api/inductive/import', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(payload),
      timeoutMs:60_000
    });
    const imported = result.imported;
    inductiveStyles = [];
    const current = currentBibleReaderLocation();
    const sameChapter = current.module === imported.location.module
      && Number(current.bookIndex) === Number(imported.location.bookIndex)
      && Number(current.chapter) === Number(imported.location.chapter);
    if (sameChapter && inductiveObservationsPanel) {
      await loadInductiveChapter(current);
      refreshInductiveRendering();
    }
    const summary = 'Импортировано: стилей — ' + imported.styles
      + ', отметок — ' + imported.annotations
      + ', связей — ' + imported.relations + '.';
    if (importInductiveMarkingsStatus) {
      importInductiveMarkingsStatus.textContent = summary + (sameChapter ? '' : ' Данные появятся при открытии импортированной главы.');
    }
  } finally {
    if (importInductiveMarkingsButton) importInductiveMarkingsButton.disabled = false;
  }
}

function createInductiveToolbarControls() {
  const group = document.createElement('div');
  group.className = 'inductive-toolbar-controls';
  const mode = document.createElement('button');
  mode.type = 'button';
  mode.className = 'inductive-toolbar-button icon inductive-mode-button';
  mode.classList.toggle('active', inductiveMode);
  mode.setAttribute('aria-pressed', String(inductiveMode));
  mode.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>';
  mode.title = inductiveMode ? 'Выключить режим разметки' : 'Включить режим разметки';
  mode.setAttribute('aria-label', mode.title);
  mode.addEventListener('click', () => {
    inductiveMode = !inductiveMode;
    localStorage.setItem('biblenote.inductive.mode', inductiveMode ? '1' : '0');
    mode.classList.toggle('active', inductiveMode);
    mode.setAttribute('aria-pressed', String(inductiveMode));
    mode.title = inductiveMode ? 'Выключить режим разметки' : 'Включить режим разметки';
    mode.setAttribute('aria-label', mode.title);
    if (!inductiveMode) hideInductivePopover();
    updateInductiveVisibilityButton();
    refreshInductiveRendering();
  });
  const visibility = document.createElement('button');
  visibility.type = 'button';
  visibility.className = 'inductive-toolbar-button icon inductive-visibility-button';
  visibility.addEventListener('click', () => {
    if (inductiveMode) return;
    inductiveMarksVisible = !inductiveMarksVisible;
    localStorage.setItem('biblenote.inductive.visible', inductiveMarksVisible ? '1' : '0');
    updateInductiveVisibilityButton();
    refreshInductiveRendering();
  });
  inductiveVisibilityButton = visibility;
  updateInductiveVisibilityButton();
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'inductive-toolbar-button icon inductive-undo-button';
  undo.textContent = '↶';
  undo.title = 'Отменить последнюю разметку';
  undo.disabled = inductiveUndoStack.length === 0;
  undo.addEventListener('click', () => undoInductiveMarks().catch(showError));
  inductiveUndoButton = undo;
  const redo = document.createElement('button');
  redo.type = 'button';
  redo.className = 'inductive-toolbar-button icon inductive-redo-button';
  redo.textContent = '↷';
  redo.title = 'Вернуть отменённую разметку';
  redo.disabled = inductiveRedoStack.length === 0;
  redo.addEventListener('click', () => redoInductiveMarks().catch(showError));
  inductiveRedoButton = redo;
  group.append(mode, visibility, undo, redo);
  updateInductiveActionButtons();
  return group;
}

if (exportInductiveMarkingsButton) {
  exportInductiveMarkingsButton.addEventListener('click', exportInductiveChapter);
  updateInductiveActionButtons();
}

if (importInductiveMarkingsButton && importInductiveMarkingsFile) {
  importInductiveMarkingsButton.addEventListener('click', () => importInductiveMarkingsFile.click());
  importInductiveMarkingsFile.addEventListener('change', () => {
    const file = importInductiveMarkingsFile.files?.[0];
    importInductiveChapterFile(file).catch(error => {
      const detail = error?.message || String(error);
      if (importInductiveMarkingsStatus) {
        importInductiveMarkingsStatus.textContent = detail.trim().startsWith('[')
          ? 'Файл не импортирован: его структура не соответствует формату разметки BibleNote.'
          : detail;
      }
      showError(error);
    }).finally(() => {
      importInductiveMarkingsFile.value = '';
    });
  });
}

function ensureInductiveEvents() {
  if (inductiveEventsReady) return;
  inductiveEventsReady = true;
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const popoverVisible = Boolean(inductivePopover && !inductivePopover.hidden);
    if (!popoverVisible && !inductiveRelationDraft) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (popoverVisible) hideInductivePopover();
    if (inductiveRelationDraft) {
      inductiveRelationDraft = null;
      refreshInductiveRendering();
    }
    window.getSelection()?.removeAllRanges();
  }, true);
  document.addEventListener('pointerdown', event => {
    if (inductivePopover && !inductivePopover.hidden && !inductivePopover.contains(event.target)) hideInductivePopover();
  });
  window.addEventListener('resize', () => {
    hideInductivePopover();
  });
  content.addEventListener('scroll', hideInductivePopover, { passive:true });
}

function bibleReaderSavedState() {
  // Keep the module and book between launches, but a chapter is only an
  // active reading position for the current window. Stale localStorage
  // values are removed for users upgrading from older versions.
  localStorage.removeItem('biblenote.reader.chapter');
  localStorage.removeItem('biblenote.reader.verse');
  localStorage.removeItem('biblenote.reader.emptyChapterDefault');
  const savedChapter = Number(sessionStorage.getItem('biblenote.reader.chapter') || '');
  return {
    module:localStorage.getItem('biblenote.reader.module') || currentBibleModule(),
    bookIndex:Number(localStorage.getItem('biblenote.reader.bookIndex') || '40') || 40,
    chapter:Number.isInteger(savedChapter) && savedChapter > 0 ? savedChapter : undefined,
    verse:Number(sessionStorage.getItem('biblenote.reader.verse') || '0') || undefined
  };
}

function saveBibleReaderState(extra = {}) {
  const state = {
    module:bibleReaderModuleEl.value || currentBibleModule(),
    bookIndex:Number(bibleReaderBookEl.value) || undefined,
    chapter:Number(bibleReaderChapterEl.value) || undefined,
    ...extra
  };
  if (state.module) localStorage.setItem('biblenote.reader.module', state.module);
  if (state.bookIndex) localStorage.setItem('biblenote.reader.bookIndex', String(state.bookIndex));
  if (state.chapter) sessionStorage.setItem('biblenote.reader.chapter', String(state.chapter));
  else sessionStorage.removeItem('biblenote.reader.chapter');
  if (state.verse) sessionStorage.setItem('biblenote.reader.verse', String(state.verse));
  else sessionStorage.removeItem('biblenote.reader.verse');
}

function bibleReaderModuleLabel(moduleName) {
  const module = bibleReaderModules.find(item => item.shortName === moduleName);
  return [module?.shortName, module?.displayName].filter(Boolean).join(' · ') || moduleName;
}

function storedBibleReaderTranslationModules(primaryModule) {
  let saved = [];
  try {
    const value = JSON.parse(localStorage.getItem('biblenote.reader.translationModules') || '[]');
    if (Array.isArray(value)) saved = value.filter(item => typeof item === 'string');
  } catch {
    // Ignore malformed state left by an older or interrupted session.
  }
  const available = new Set(bibleReaderModules.map(module => module.shortName));
  const secondaries = saved.filter(module => module !== primaryModule && available.has(module));
  return [primaryModule, ...new Set(secondaries)].filter(Boolean).slice(0, 3);
}

function setBibleReaderTranslationModules(modules) {
  const primaryModule = bibleReaderModuleEl.value || currentBibleModule();
  const available = new Set(bibleReaderModules.map(module => module.shortName));
  bibleReaderTranslationModules = [
    primaryModule,
    ...modules.filter(module => module !== primaryModule && available.has(module))
  ].filter(Boolean).slice(0, 3);
  localStorage.setItem('biblenote.reader.translationModules', JSON.stringify(bibleReaderTranslationModules));
}

function syncBibleReaderTranslationModules() {
  setBibleReaderTranslationModules(storedBibleReaderTranslationModules(
    bibleReaderModuleEl.value || currentBibleModule()
  ));
}

function selectedBibleReaderBook() {
  const bookIndex = Number(bibleReaderBookEl.value);
  return bibleReaderBooks.find(book => Number(book.index) === bookIndex);
}

function updateBibleReaderNavButtons() {
  const book = selectedBibleReaderBook();
  const chapter = Number(bibleReaderChapterEl.value);
  const chapters = Array.isArray(book?.chapters) ? book.chapters.map(Number) : [];
  const firstChapter = chapters[0] || 1;
  const lastChapter = chapters[chapters.length - 1] || Number(book?.chapterCount || 1);
  const hasBook = Boolean(book);
  bibleReaderPrevButton.disabled = !hasBook || !Number.isInteger(chapter) || chapter <= firstChapter;
  bibleReaderNextButton.disabled = !hasBook || !Number.isInteger(chapter) || chapter >= lastChapter;
}

function fillBibleReaderChapters(preferredChapter) {
  const book = selectedBibleReaderBook();
  bibleReaderChapterEl.replaceChildren();
  const preferred = Number(preferredChapter);
  const hasPreferred = Number.isInteger(preferred) && preferred > 0;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Глава';
  placeholder.selected = !hasPreferred;
  bibleReaderChapterEl.append(placeholder);
  const chapters = Array.isArray(book?.chapters) && book.chapters.length > 0
    ? book.chapters
    : Array.from({ length:Number(book?.chapterCount || 0) }, (_, index) => index + 1);
  for (const chapter of chapters) {
    const option = document.createElement('option');
    option.value = String(chapter);
    option.textContent = String(chapter);
    option.selected = Number(chapter) === preferred;
    bibleReaderChapterEl.append(option);
  }
  bibleReaderChapterEl.disabled = chapters.length === 0;
  updateBibleReaderNavButtons();
}

function fillBibleReaderBooks(books, preferredBookIndex, preferredChapter) {
  bibleReaderBooks = books;
  bibleReaderBookEl.replaceChildren();
  for (const book of books) {
    const option = document.createElement('option');
    option.value = String(book.index);
    option.textContent = book.name || book.shortName || String(book.index);
    if (book.shortName && book.name && book.shortName !== book.name) option.title = book.shortName;
    option.selected = Number(book.index) === Number(preferredBookIndex);
    bibleReaderBookEl.append(option);
  }
  bibleReaderBookEl.disabled = bibleReaderBookEl.options.length === 0;
  if (bibleReaderBookEl.options.length > 0 && !bibleReaderBookEl.value) bibleReaderBookEl.selectedIndex = 0;
  fillBibleReaderChapters(preferredChapter);
}

function currentBibleReaderLocation() {
  return {
    module:bibleReaderModuleEl.value || currentBibleModule(),
    book:selectedBibleReaderBook(),
    bookIndex:Number(bibleReaderBookEl.value),
    chapter:Number(bibleReaderChapterEl.value)
  };
}

async function refreshBibleReaderModules() {
  const state = bibleReaderSavedState();
  bibleReaderStatusEl.textContent = 'Загрузка модулей...';
  const result = await api('/api/biblenote/modules');
  const modules = Array.isArray(result.modules) ? result.modules : [];
  bibleReaderModules = modules.filter(module => module?.shortName);
  fillBibleModuleSelect(bibleReaderModuleEl, modules, state.module);
  if (bibleReaderModuleEl.disabled) {
    bibleReaderStatusEl.textContent = result.available ? 'Загруженные модули не найдены.' : (result.error || 'BibleNote недоступен.');
    fillBibleReaderBooks([], undefined, undefined);
    return;
  }
  syncBibleReaderTranslationModules();
  await refreshBibleReaderBooks(state.bookIndex, state.chapter);
}

async function refreshBibleReaderBooks(preferredBookIndex, preferredChapter, options = {}) {
  if (!bibleReaderModuleEl.value) return;
  bibleReaderLoading = true;
  bibleReaderStatusEl.textContent = 'Загрузка книг...';
  try {
    const result = await api('/api/bible/books?' + new URLSearchParams({ module:bibleReaderModuleEl.value }).toString(), { timeoutMs:60000 });
    const books = Array.isArray(result.books) ? result.books : [];
    fillBibleReaderBooks(books, preferredBookIndex, preferredChapter);
    bibleReaderStatusEl.textContent = books.length > 0 ? '' : 'В модуле не найдены книги.';
    if (books.length > 0 && options.open === true && Number(bibleReaderChapterEl.value) > 0) await openBibleReaderChapter();
  } finally {
    bibleReaderLoading = false;
  }
}

function bibleReaderVerseRef(result, verse) {
  const book = selectedBibleReaderBook();
  const bookName = result.bookName || book?.name;
  const bookShortName = result.bookShortName || book?.shortName;
  const referenceName = bookShortName || bookName || 'Библия';
  const verseReference = String(verse.reference || '').trim();
  const fullReference = /[A-Za-zА-Яа-яЁё]/.test(verseReference)
    ? verseReference
    : referenceName + ' ' + verse.chapter + ':' + verse.verse;
  return {
    normalizedRef:fullReference,
    originalText:fullReference,
    module:result.module || bibleReaderModuleEl.value || currentBibleModule(),
    bookIndex:result.bookIndex || Number(bibleReaderBookEl.value),
    bookName,
    bookShortName,
    chapter:Number(verse.chapter),
    verse:Number(verse.verse),
    topChapter:Number(verse.chapter),
    topVerse:Number(verse.verse)
  };
}

async function showBibleReaderVerseNotes(ref) {
  if (typeof setPageFocusMode === 'function' && pageFocusMode) setPageFocusMode(false);
  const query = ref.normalizedRef || ref.originalText || '';
  searchInput.value = query;
  activeSearchQuery = query;
  rememberSearch(query);
  const notesPanel = document.querySelector('.notes-panel');
  if (notesPanel) notesPanel.setAttribute('open', '');
  await renderSearch(query);
}

function createBibleReaderVerseActions(ref) {
  const actions = document.createElement('span');
  actions.className = 'bible-reader-verse-actions';
  const notesButton = document.createElement('button');
  notesButton.className = 'bible-reader-action';
  notesButton.type = 'button';
  notesButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9l4 4v5M14 3v5h4M8 12h4M8 16h2"/><circle cx="15.5" cy="16.5" r="3.5"/><path d="m18 19 3 3"/></svg>';
  notesButton.title = 'Показать заметки';
  notesButton.setAttribute('aria-label', 'Показать заметки для ' + (ref.normalizedRef || ref.originalText));
  notesButton.addEventListener('click', event => {
    event.stopPropagation();
    showBibleReaderVerseNotes(ref).catch(showError);
  });
  const parallelButton = document.createElement('button');
  parallelButton.className = 'bible-reader-action';
  parallelButton.type = 'button';
  parallelButton.textContent = '⇄';
  parallelButton.title = 'Показать параллельные ссылки';
  parallelButton.setAttribute('aria-label', 'Показать параллельные ссылки для ' + (ref.normalizedRef || ref.originalText));
  parallelButton.addEventListener('click', event => {
    event.stopPropagation();
    openBibleParallelPanel(ref).catch(showError);
  });
  actions.append(notesButton, parallelButton);
  return actions;
}

function createBibleReaderTranslationsControl() {
  const details = document.createElement('details');
  details.className = 'bible-reader-translations';
  const summary = document.createElement('summary');
  summary.className = 'bible-reader-translations-summary';
  summary.title = 'Выбрать до трёх переводов';
  summary.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6v14H4zM14 5h6v14h-6z"/></svg><span>Переводы</span><strong>' + bibleReaderTranslationModules.length + '</strong>';
  const menu = document.createElement('div');
  menu.className = 'bible-reader-translations-menu';
  const hint = document.createElement('div');
  hint.className = 'bible-reader-translations-hint';
  hint.textContent = 'Одновременно можно показать до трёх переводов.';
  menu.append(hint);
  const selected = new Set(bibleReaderTranslationModules);
  const pending = [...bibleReaderTranslationModules];
  const choices = [];
  const primaryModule = bibleReaderModuleEl.value || currentBibleModule();
  for (const module of bibleReaderModules) {
    const label = document.createElement('label');
    label.className = 'bible-reader-translation-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = module.shortName;
    input.checked = selected.has(module.shortName);
    input.disabled = module.shortName === primaryModule
      || (!input.checked && pending.length >= 3);
    const text = document.createElement('span');
    text.className = 'bible-reader-translation-option-text';
    const name = document.createElement('strong');
    name.textContent = bibleReaderModuleLabel(module.shortName);
    text.append(name);
    if (module.shortName === primaryModule) {
      const primary = document.createElement('small');
      primary.textContent = 'Основной перевод';
      text.append(primary);
    }
    input.addEventListener('change', () => {
      if (input.checked) {
        if (pending.length >= 3) {
          input.checked = false;
          return;
        }
        pending.push(module.shortName);
      } else {
        const index = pending.indexOf(module.shortName);
        if (index >= 0) pending.splice(index, 1);
      }
      for (const choice of choices) {
        choice.disabled = choice.value === primaryModule
          || (!choice.checked && pending.length >= 3);
      }
    });
    choices.push(input);
    label.append(input, text);
    menu.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'bible-reader-translations-actions';
  const apply = document.createElement('button');
  apply.className = 'bible-reader-translations-apply';
  apply.type = 'button';
  apply.textContent = 'Показать';
  apply.addEventListener('click', () => {
    setBibleReaderTranslationModules(pending);
    details.open = false;
    openBibleReaderChapter({ rememberHistory:false, replaceUrl:true }).catch(showError);
  });
  actions.append(apply);
  menu.append(actions);
  details.append(summary, menu);
  return details;
}

function bibleReaderParallelRows(translation) {
  return new Map((Array.isArray(translation?.rows) ? translation.rows : []).map(row => [
    Number(row.baseChapter) + ':' + Number(row.baseVerse),
    row
  ]));
}

function bibleReaderDisplayText(value) {
  return typeof decodeHtmlText === 'function'
    ? decodeHtmlText(value)
    : String(value || '');
}

function selectBibleReaderVerse(row, verseNumber) {
  const versesEl = row.closest('.bible-reader-verses');
  if (!versesEl) return;
  versesEl.querySelectorAll('.bible-reader-verse.selected, .bible-reader-translation-row.selected')
    .forEach(item => item.classList.remove('selected'));
  row.classList.add('selected');
  saveBibleReaderState({ verse:Number(verseNumber) });
  row.scrollIntoView({ block:'center', behavior:'smooth' });
}

function toggleBibleReaderVerseSelection(versesEl, row, selectedSelector, verseNumber) {
  const shouldClear = row.classList.contains('selected');
  versesEl.querySelectorAll(selectedSelector).forEach(item => item.classList.remove('selected'));
  if (!shouldClear) row.classList.add('selected');
  saveBibleReaderState({ verse:shouldClear ? undefined : Number(verseNumber) });
}

function renderBibleReaderParallelChapter(versesEl, result, translations, highlightRef) {
  const columns = [
    {
      module:result.module || bibleReaderModuleEl.value,
      moduleName:result.moduleName,
      primary:true,
      result
    },
    ...translations.map(translation => ({
      ...translation,
      rowsByVerse:bibleReaderParallelRows(translation)
    }))
  ];
  versesEl.classList.add('parallel-translations');
  versesEl.style.setProperty('--translation-count', String(columns.length));

  const header = document.createElement('div');
  header.className = 'bible-reader-translation-header';
  header.setAttribute('aria-hidden', 'true');
  header.append(document.createElement('span'));
  for (const column of columns) {
    const cell = document.createElement('div');
    cell.className = 'bible-reader-translation-heading';
    const name = document.createElement('strong');
    name.textContent = bibleReaderModuleLabel(column.module);
    cell.append(name);
    if (column.primary) {
      const primary = document.createElement('span');
      primary.className = 'bible-reader-primary-badge';
      primary.textContent = 'Основной';
      cell.append(primary);
    } else if (column.error) {
      cell.classList.add('error');
      cell.title = column.error;
      const error = document.createElement('span');
      error.textContent = 'Недоступен';
      cell.append(error);
    }
    header.append(cell);
  }
  versesEl.append(header);

  let firstHighlighted = null;
  const primaryVerses = Array.isArray(result.verses) ? result.verses : [];
  for (const verse of primaryVerses) {
    const row = document.createElement('div');
    row.className = 'bible-reader-translation-row';
    row.id = 'bible-verse-' + verse.chapter + '-' + verse.verse;
    row.tabIndex = 0;
    const number = document.createElement('span');
    number.className = 'bible-reader-verse-number';
    number.textContent = verse.topVerse && Number(verse.topVerse) !== Number(verse.verse)
      ? verse.verse + '–' + verse.topVerse
      : String(verse.verse);
    row.append(number);

    const ref = bibleReaderVerseRef(result, verse);
    const primaryCell = document.createElement('div');
    primaryCell.className = 'bible-reader-translation-cell primary';
    primaryCell.dataset.moduleLabel = bibleReaderModuleLabel(columns[0].module);
    const primaryText = document.createElement('span');
    primaryText.className = 'bible-reader-translation-text';
    prepareInductiveTextElement(primaryText, result, verse, bibleReaderDisplayText(verse.text));
    primaryCell.append(primaryText, createBibleReaderVerseActions(ref));
    row.append(primaryCell);

    for (const column of columns.slice(1)) {
      const cell = document.createElement('div');
      cell.className = 'bible-reader-translation-cell';
      cell.dataset.moduleLabel = bibleReaderModuleLabel(column.module);
      const mappedRow = column.rowsByVerse?.get(Number(verse.chapter) + ':' + Number(verse.verse));
      const mappedVerses = Array.isArray(mappedRow?.verses) ? mappedRow.verses : [];
      if (column.error) {
        cell.classList.add('error');
        cell.textContent = 'Не удалось загрузить перевод';
      } else if (mappedVerses.length === 0 || mappedVerses.every(item => item.isEmpty && !item.text)) {
        cell.classList.add('empty');
        cell.textContent = '—';
      } else {
        for (const mappedVerse of mappedVerses) {
          if (mappedVerse.isEmpty && !mappedVerse.text) continue;
          const fragment = document.createElement('div');
          fragment.className = 'bible-reader-translation-fragment';
          if (mappedVerses.length > 1
            || Number(mappedVerse.verse) !== Number(verse.verse)
            || Number(mappedVerse.chapter) !== Number(verse.chapter)) {
            const mappedNumber = document.createElement('span');
            mappedNumber.className = 'bible-reader-mapped-number';
            mappedNumber.textContent = mappedVerse.reference
              || (mappedVerse.chapter + ':' + mappedVerse.verse);
            fragment.append(mappedNumber);
          }
          const text = document.createElement('span');
          text.textContent = bibleReaderDisplayText(mappedVerse.text);
          fragment.append(text);
          cell.append(fragment);
        }
        if (!cell.hasChildNodes()) {
          cell.classList.add('empty');
          cell.textContent = '—';
        }
      }
      row.append(cell);
    }

    row.addEventListener('click', () => {
      toggleBibleReaderVerseSelection(
        versesEl,
        row,
        '.bible-reader-translation-row.selected',
        verse.verse
      );
    });
    if (bibleVerseIsInsideReference(verse, highlightRef)) {
      row.classList.add('selected');
      if (!firstHighlighted) firstHighlighted = row;
    }
    versesEl.append(row);
  }
  return firstHighlighted;
}

function renderBibleReaderChapter(result, highlightRef, translations = []) {
  if (typeof setPageFocusMode === 'function' && pageFocusMode) setPageFocusMode(false);
  ensureInductiveEvents();
  inductiveVerseTextByVerse = new Map((Array.isArray(result.verses) ? result.verses : []).map(verse => [
    Number(verse.verse),
    bibleReaderDisplayText(verse.text)
  ]));
  content.replaceChildren();
  selectedPageId = null;
  currentTargetParagraphIndex = undefined;
  const article = document.createElement('article');
  article.className = 'page bible-reader-page';
  article.classList.toggle('comparison', translations.length > 0);
  const crumbs = document.createElement('div');
  crumbs.className = 'breadcrumbs';
  crumbs.textContent = translations.length > 0
    ? 'Библия / ' + (translations.length + 1) + ' перевода'
    : ['Библия', result.moduleName || result.module].filter(Boolean).join(' / ');
  const title = document.createElement('h2');
  title.textContent = [result.bookName || selectedBibleReaderBook()?.name || 'Книга', result.chapter].filter(Boolean).join(' ');
  const heading = document.createElement('div');
  heading.className = 'page-heading';
  const headingActions = document.createElement('div');
  headingActions.className = 'page-heading-actions';
  headingActions.append(createViewHistoryButtons());
  heading.append(title, headingActions);
  const toolbar = document.createElement('div');
  toolbar.className = 'bible-reader-toolbar';
  const previous = document.createElement('button');
  previous.className = 'bible-reader-nav-button';
  previous.type = 'button';
  previous.textContent = '←';
  previous.title = 'Предыдущая глава';
  previous.disabled = bibleReaderPrevButton.disabled;
  previous.addEventListener('click', () => stepBibleReaderChapter(-1).catch(showError));
  const next = document.createElement('button');
  next.className = 'bible-reader-nav-button';
  next.type = 'button';
  next.textContent = '→';
  next.title = 'Следующая глава';
  next.disabled = bibleReaderNextButton.disabled;
  next.addEventListener('click', () => stepBibleReaderChapter(1).catch(showError));
  const meta = document.createElement('div');
  meta.className = 'bible-text-meta';
  meta.textContent = result.reference || '';
  toolbar.append(previous, next, meta, createInductiveToolbarControls(), createBibleReaderTranslationsControl());
  const versesEl = document.createElement('div');
  versesEl.className = 'bible-reader-verses';
  let firstHighlighted = null;
  if (translations.length > 0) {
    firstHighlighted = renderBibleReaderParallelChapter(versesEl, result, translations, highlightRef);
  } else for (const verse of Array.isArray(result.verses) ? result.verses : []) {
    const block = document.createElement('div');
    block.className = 'bible-reader-verse-block';
    const row = document.createElement('div');
    row.className = 'bible-reader-verse';
    row.id = 'bible-verse-' + verse.chapter + '-' + verse.verse;
    row.tabIndex = 0;
    const ref = bibleReaderVerseRef(result, verse);
    const number = document.createElement('span');
    number.className = 'bible-reader-verse-number';
    number.textContent = String(verse.verse);
    const text = document.createElement('span');
    text.className = 'bible-reader-verse-text';
    prepareInductiveTextElement(text, result, verse, bibleReaderDisplayText(verse.text));
    const actions = createBibleReaderVerseActions(ref);
    row.append(number, text, actions);
    row.addEventListener('click', () => {
      toggleBibleReaderVerseSelection(
        versesEl,
        row,
        '.bible-reader-verse.selected',
        verse.verse
      );
    });
    if (bibleVerseIsInsideReference(verse, highlightRef)) {
      row.classList.add('selected');
      if (!firstHighlighted) firstHighlighted = row;
    }
    block.append(row);
    versesEl.append(block);
  }
  const workspace = document.createElement('div');
  workspace.className = 'inductive-reader-workspace';
  const observations = document.createElement('aside');
  observations.className = 'inductive-observations-panel';
  observations.setAttribute('aria-label', 'Индуктивные наблюдения');
  inductiveObservationsPanel = observations;
  workspace.append(versesEl, observations);
  article.append(crumbs, heading, toolbar, workspace);
  content.append(article);
  renderInductiveObservations();
  refreshPageFind();
  if (firstHighlighted) requestAnimationFrame(() => firstHighlighted.scrollIntoView({ block:'center', behavior:'smooth' }));
}

async function openBibleReaderChapter(options = {}) {
  const location = currentBibleReaderLocation();
  if (!location.book || !Number.isInteger(location.chapter) || location.chapter <= 0) {
    bibleReaderStatusEl.textContent = 'Выберите модуль, книгу и главу.';
    return;
  }
  saveBibleReaderState({ verse:options.ref?.verse || options.verse });
  syncBibleReaderTranslationModules();
  bibleReaderStatusEl.textContent = bibleReaderTranslationModules.length > 1
    ? 'Загрузка переводов...'
    : 'Загрузка главы...';
  const params = new URLSearchParams({
    module:location.module,
    bookIndex:String(location.bookIndex),
    chapter:String(location.chapter)
  });
  if (location.book.name) params.set('bookName', location.book.name);
  if (location.book.shortName) params.set('bookShortName', location.book.shortName);
  const secondaryModules = bibleReaderTranslationModules.filter(module => module !== location.module).slice(0, 2);
  const [result, translations] = await Promise.all([
    api('/api/bible/text?' + params.toString(), { timeoutMs:60000 }),
    Promise.all(secondaryModules.map(async module => {
      const parallelParams = new URLSearchParams({
        baseModule:location.module,
        module,
        bookIndex:String(location.bookIndex),
        chapter:String(location.chapter)
      });
      try {
        return await api('/api/bible/parallel-text?' + parallelParams.toString(), { timeoutMs:60000 });
      } catch (error) {
        return {
          baseModule:location.module,
          module,
          moduleName:bibleReaderModuleLabel(module),
          rows:[],
          error:error?.message || String(error)
        };
      }
    })),
    loadInductiveChapter(location)
  ]);
  bibleReaderSummaryEl.textContent = 'Библия: ' + (result.bookShortName || location.book.shortName || location.book.name) + ' ' + location.chapter;
  bibleReaderStatusEl.textContent = '';
  const highlightRef = options.ref || (options.verse ? {
    module:location.module,
    bookIndex:location.bookIndex,
    bookName:location.book.name,
    bookShortName:location.book.shortName,
    chapter:location.chapter,
    verse:Number(options.verse),
    topChapter:location.chapter,
    topVerse:Number(options.verse)
  } : null);
  if (options.updateUrl !== false) updateBibleReaderUrl(location, options.replaceUrl === true, highlightRef);
  if (options.rememberHistory !== false) {
    rememberViewHistory({
      type:'bible',
      module:location.module,
      bookIndex:location.bookIndex,
      chapter:location.chapter,
      verse:highlightRef?.verse,
      topChapter:highlightRef?.topChapter,
      topVerse:highlightRef?.topVerse
    });
  } else {
    updateViewHistoryButtons();
  }
  renderBibleReaderChapter(result, highlightRef, translations);
}

async function stepBibleReaderChapter(delta) {
  const book = selectedBibleReaderBook();
  if (!book) return;
  const chapters = Array.isArray(book.chapters) && book.chapters.length > 0
    ? book.chapters.map(Number)
    : Array.from({ length:Number(book.chapterCount || 0) }, (_, index) => index + 1);
  const current = Number(bibleReaderChapterEl.value);
  const currentIndex = chapters.indexOf(current);
  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= chapters.length) return;
  bibleReaderChapterEl.value = String(chapters[nextIndex]);
  updateBibleReaderNavButtons();
  await openBibleReaderChapter();
}

async function openBibleReaderLocation(location, options = {}) {
  if (!location?.module || !location?.bookIndex || !location?.chapter) return;
  if (bibleReaderModuleEl.value !== location.module) {
    bibleReaderModuleEl.value = location.module;
    localStorage.setItem('biblenote.reader.module', location.module);
    await refreshBibleReaderBooks(Number(location.bookIndex), Number(location.chapter));
  } else if (bibleReaderBookEl.disabled || Number(bibleReaderBookEl.value) !== Number(location.bookIndex)) {
    await refreshBibleReaderBooks(Number(location.bookIndex), Number(location.chapter));
  }
  bibleReaderBookEl.value = String(location.bookIndex);
  fillBibleReaderChapters(Number(location.chapter));
  bibleReaderChapterEl.value = String(location.chapter);
  updateBibleReaderNavButtons();
  await openBibleReaderChapter({
    rememberHistory:options.rememberHistory,
    updateUrl:options.updateUrl,
    replaceUrl:options.replaceUrl,
    ref:location.verse ? {
      module:location.module,
      bookIndex:Number(location.bookIndex),
      chapter:Number(location.chapter),
      verse:Number(location.verse),
      topChapter:Number(location.topChapter || location.chapter),
      topVerse:Number(location.topVerse || location.verse)
    } : undefined
  });
}

async function openBibleFromRibbon() {
  await bibleNoteInitialization;
  const panel = bibleReaderSummaryEl.closest('details');
  if (panel) panel.open = true;

  await refreshBibleReaderModules();
  if (bibleReaderModuleEl.disabled || bibleReaderBookEl.disabled) {
    throw new Error(bibleReaderStatusEl.textContent || 'Не удалось открыть Библию.');
  }

  const state = bibleReaderSavedState();
  const book = selectedBibleReaderBook();
  const chapters = Array.isArray(book?.chapters) && book.chapters.length > 0
    ? book.chapters.map(Number)
    : Array.from({ length:Number(book?.chapterCount || 0) }, (_, index) => index + 1);
  const chapter = Number(bibleReaderChapterEl.value)
    || Number(state.chapter)
    || Number(chapters[0]);
  if (!book || !Number.isInteger(chapter) || chapter <= 0) {
    throw new Error('В выбранной книге не найдены главы.');
  }

  await openBibleReaderLocation({
    module:bibleReaderModuleEl.value || state.module,
    bookIndex:Number(book.index),
    chapter
  });
}

async function openBibleTextInReader(ref = currentBibleTextRef) {
  if (!ref?.bookIndex || !ref?.chapter) return;
  const moduleName = ref.module || currentBibleModule();
  if (bibleReaderModuleEl.value !== moduleName) {
    bibleReaderModuleEl.value = moduleName;
    localStorage.setItem('biblenote.reader.module', moduleName);
  }
  if (bibleReaderBookEl.disabled || Number(bibleReaderBookEl.value) !== Number(ref.bookIndex)) {
    await refreshBibleReaderBooks(Number(ref.bookIndex), Number(ref.chapter));
  }
  bibleReaderBookEl.value = String(ref.bookIndex);
  fillBibleReaderChapters(Number(ref.chapter));
  bibleReaderChapterEl.value = String(ref.chapter);
  updateBibleReaderNavButtons();
  if (bibleTextDialog.open) bibleTextDialog.close();
  await openBibleReaderChapter({ ref });
}

bibleReaderModuleEl.addEventListener('change', () => {
  const state = bibleReaderSavedState();
  localStorage.setItem('biblenote.reader.module', bibleReaderModuleEl.value);
  syncBibleReaderTranslationModules();
  refreshBibleReaderBooks(state.bookIndex, state.chapter, { open:true }).catch(showError);
});
bibleReaderBookEl.addEventListener('change', () => {
  fillBibleReaderChapters(undefined);
  saveBibleReaderState();
});
bibleReaderChapterEl.addEventListener('change', () => {
  updateBibleReaderNavButtons();
  saveBibleReaderState();
  if (Number(bibleReaderChapterEl.value) > 0) openBibleReaderChapter().catch(showError);
});
bibleReaderPrevButton.addEventListener('click', () => stepBibleReaderChapter(-1).catch(showError));
bibleReaderNextButton.addEventListener('click', () => stepBibleReaderChapter(1).catch(showError));

async function tryOpenBibleReaderReference(rawRef) {
  const value = String(rawRef || '').trim();
  if (!value || bibleReaderLoading) return false;
  try {
    const params = new URLSearchParams({
      ref:value,
      module:bibleReaderModuleEl.value || currentBibleModule()
    });
    const result = await api('/api/bible/parse-link?' + params.toString());
    const ref = result.reference;
    if (!ref || !Number.isInteger(Number(ref.bookIndex)) || !Number.isInteger(Number(ref.chapter))) {
      return false;
    }
    await openBibleReaderLocation({
      ...ref,
      module:ref.module || bibleReaderModuleEl.value || currentBibleModule(),
      bookIndex:Number(ref.bookIndex),
      chapter:Number(ref.chapter),
      verse:ref.verse == null ? undefined : Number(ref.verse),
      topChapter:ref.topChapter == null ? undefined : Number(ref.topChapter),
      topVerse:ref.topVerse == null ? undefined : Number(ref.topVerse)
    });
    return true;
  } catch {
    return false;
  }
}
