(function setupMyBibleReviewSettings() {
  const mapPathInput = document.getElementById('myBibleReviewMapPath');
  const selectButton = document.getElementById('selectMyBibleReviewMap');
  const footnotesPathInput = document.getElementById('myBibleReviewFootnotesPath');
  const selectFootnotesButton = document.getElementById('selectMyBibleReviewFootnotes');
  const openButton = document.getElementById('openMyBibleReview');
  const statusElement = document.getElementById('myBibleReviewStatus');
  const reviewDialog = document.getElementById('myBibleReviewDialog');
  const reviewFrame = document.getElementById('myBibleReviewFrame');
  const dialogPath = document.getElementById('myBibleReviewDialogPath');
  const closeButton = document.getElementById('closeMyBibleReview');
  if (!mapPathInput || !selectButton || !footnotesPathInput || !selectFootnotesButton || !openButton || !statusElement || !reviewDialog || !reviewFrame || !dialogPath || !closeButton) return;

  const mapStorageKey = 'biblenote.myBibleReviewMapPath';
  const footnotesStorageKey = 'biblenote.myBibleReviewFootnotesPath';
  mapPathInput.value = localStorage.getItem(mapStorageKey) || '';
  footnotesPathInput.value = localStorage.getItem(footnotesStorageKey) || '';

  function updateOpenState() {
    openButton.disabled = !String(mapPathInput.value || '').trim();
  }

  function saveMapPath() {
    const mapPath = String(mapPathInput.value || '').trim();
    if (mapPath) localStorage.setItem(mapStorageKey, mapPath);
    else localStorage.removeItem(mapStorageKey);
    updateOpenState();
  }

  function saveFootnotesPath() {
    const footnotesPath = String(footnotesPathInput.value || '').trim();
    if (footnotesPath) localStorage.setItem(footnotesStorageKey, footnotesPath);
    else localStorage.removeItem(footnotesStorageKey);
  }

  async function selectMap() {
    selectButton.disabled = true;
    statusElement.textContent = 'Выбор карты расхождений…';
    try {
      const result = await api('/api/system/select-file?kind=mybible-map', { method:'POST' });
      if (result.filePath) {
        mapPathInput.value = result.filePath;
        saveMapPath();
        statusElement.textContent = 'Карта выбрана. Нажмите «Проверить карту».';
      } else if (result.available === false) {
        statusElement.textContent = 'Системный выбор файла доступен в настольном приложении. Укажите абсолютный путь вручную.';
      } else if (!result.canceled) {
        statusElement.textContent = result.error || 'Не удалось выбрать карту расхождений.';
      } else {
        statusElement.textContent = '';
      }
    } catch (error) {
      statusElement.textContent = 'Не удалось выбрать карту: ' + (error?.message || String(error));
    } finally {
      selectButton.disabled = false;
      updateOpenState();
    }
  }

  async function selectFootnotes() {
    selectFootnotesButton.disabled = true;
    statusElement.textContent = 'Выбор файла сносок…';
    try {
      const result = await api('/api/system/select-file?kind=mybible-footnotes', { method:'POST' });
      if (result.filePath) {
        footnotesPathInput.value = result.filePath;
        saveFootnotesPath();
        statusElement.textContent = 'Файл сносок выбран.';
      } else if (result.available === false) {
        statusElement.textContent = 'Системный выбор файла доступен в настольном приложении. Укажите абсолютный путь вручную.';
      } else if (!result.canceled) {
        statusElement.textContent = result.error || 'Не удалось выбрать файл сносок.';
      } else {
        statusElement.textContent = '';
      }
    } catch (error) {
      statusElement.textContent = 'Не удалось выбрать файл сносок: ' + (error?.message || String(error));
    } finally {
      selectFootnotesButton.disabled = false;
    }
  }

  async function openReview() {
    const mapPath = String(mapPathInput.value || '').trim();
    const footnotesPath = String(footnotesPathInput.value || '').trim();
    if (!mapPath) return;
    saveMapPath();
    saveFootnotesPath();
    openButton.disabled = true;
    statusElement.textContent = 'Проверка карты и запуск редактора…';
    try {
      const result = await api('/api/mybible/review/start', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ mapPath, footnotesPath:footnotesPath || undefined })
      });
      reviewFrame.src = result.url;
      dialogPath.textContent = result.mapPath || mapPath;
      reviewDialog.showModal();
      statusElement.textContent = 'Редактор карты открыт.';
    } catch (error) {
      statusElement.textContent = 'Не удалось открыть карту: ' + (error?.message || String(error));
    } finally {
      updateOpenState();
    }
  }

  async function stopReview() {
    reviewFrame.src = 'about:blank';
    try {
      await api('/api/mybible/review/stop', { method:'POST' });
    } catch (error) {
      statusElement.textContent = 'Редактор закрыт, но локальный сервер не удалось остановить: ' + (error?.message || String(error));
    }
  }

  mapPathInput.addEventListener('input', saveMapPath);
  mapPathInput.addEventListener('change', saveMapPath);
  footnotesPathInput.addEventListener('input', saveFootnotesPath);
  footnotesPathInput.addEventListener('change', saveFootnotesPath);
  selectButton.addEventListener('click', () => void selectMap());
  selectFootnotesButton.addEventListener('click', () => void selectFootnotes());
  openButton.addEventListener('click', () => void openReview());
  closeButton.addEventListener('click', () => reviewDialog.close());
  reviewDialog.addEventListener('close', () => void stopReview());
  updateOpenState();
})();
