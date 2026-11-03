'use strict';

// Runs inside document frames, including sandboxed srcdoc (no localStorage access).
(function startContentTheme() {
  const root = document.documentElement;
  const pdf = root.dataset.contentKind === 'pdf';
  const baseBackground = [31, 30, 36];
  const overrides = new Map();
  const parsedColors = new Map();
  let colorContext;
  let dark = false;
  let initialized = false;
  let pending = 0;

  function rgb(value) {
    if (parsedColors.has(value)) return parsedColors.get(value);
    const values = String(value).match(/^rgba?\(([^)]+)\)$/)?.[1].match(/[\d.]+/g)?.map(Number);
    let result = values?.length >= 3 ? [...values.slice(0, 3), values[3] ?? 1] : null;
    if (!result && CSS.supports('color', value)) {
      // Computed modern CSS colors can remain oklch()/color(srgb ...).
      // Let the browser convert these to sRGB once per distinct color.
      if (!colorContext) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        colorContext = canvas.getContext('2d', { willReadFrequently:true });
      }
      if (colorContext) {
        colorContext.clearRect(0, 0, 1, 1);
        colorContext.fillStyle = value;
        colorContext.fillRect(0, 0, 1, 1);
        const channels = colorContext.getImageData(0, 0, 1, 1).data;
        result = [...channels.slice(0, 3), channels[3] / 255];
      }
    }
    parsedColors.set(value, result);
    return result;
  }

  function luminance(color) {
    return color.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255;
      return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
        * [.2126, .7152, .0722][index];
    }, 0);
  }

  function hsl(color) {
    const [r, g, b] = color.map(value => value / 255);
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    const delta = high - low, light = (high + low) / 2;
    const hue = !delta ? 0 : high === r ? ((g - b) / delta + 6) % 6
      : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return [hue / 6, delta ? delta / (1 - Math.abs(2 * light - 1)) : 0, light];
  }

  function fromHsl(hue, saturation, light) {
    const a = saturation * Math.min(light, 1 - light);
    return [0, 8, 4].map(offset => {
      const k = (offset + hue * 12) % 12;
      return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    });
  }

  function mapColor(color, role, background = baseBackground) {
    const [hue, saturation, light] = hsl(color.slice(0, 3));
    if (role === 'background') {
      // Already dark surfaces stay dark; light paper becomes charcoal. Colored
      // cells/highlights keep their hue with a bounded, subdued lightness.
      if (saturation < .08) return light < .13 ? color.slice(0, 3) : baseBackground;
      return fromHsl(hue, Math.min(saturation, .65), Math.min(light, .14 + .08 * (1 - light)));
    }
    if (role === 'border') return fromHsl(hue, Math.min(saturation, .5), .36);
    let targetLight = saturation < .08 ? .86 : .72;
    let result = saturation < .08 ? [220, 217, 225] : fromHsl(hue, Math.min(saturation, .78), targetLight);
    while ((luminance(result) + .05) / (luminance(background) + .05) < 4.5 && targetLight < .96) {
      targetLight += .02;
      result = fromHsl(hue, Math.min(saturation, .78), targetLight);
    }
    return result;
  }

  function cssColor(color, alpha = 1) {
    return `rgba(${color.join(',')},${alpha})`;
  }

  function override(element, property, value) {
    let properties = overrides.get(element);
    if (!properties) overrides.set(element, properties = new Map());
    properties.set(property, {
      value:element.style.getPropertyValue(property),
      priority:element.style.getPropertyPriority(property),
      applied:value
    });
    element.style.setProperty(property, value, 'important');
    // CSSOM normalizes colors, so compare its serialization on restoration.
    properties.get(property).applied = element.style.getPropertyValue(property);
  }

  function restore() {
    for (const [element, properties] of overrides) {
      for (const [property, original] of properties) {
        // Respect edits made by the viewer (for example search highlighting).
        if (element.style.getPropertyValue(property) !== original.applied
          || element.style.getPropertyPriority(property) !== 'important') continue;
        if (original.value) element.style.setProperty(property, original.value, original.priority);
        else element.style.removeProperty(property);
      }
    }
    overrides.clear();
  }

  const observer = new MutationObserver(() => {
    if (!dark || pending) return;
    pending = requestAnimationFrame(() => { pending = 0; paint(); });
  });

  function observe() {
    observer.observe(root, {
      subtree:true, childList:true, attributes:true,
      attributeFilter:['style', 'class', 'color', 'bgcolor', 'data-onenote-page-find-current',
        'data-onenote-main-search-current', 'data-onenote-target-paragraph',
        'data-onenote-target-paragraph-current', 'data-onenote-target-match', 'data-onenote-target-match-current']
    });
  }

  function paint() {
    observer.disconnect();
    restore();
    root.dataset.contentTheme = 'light';
    if (dark) {
      const properties = ['color', 'background-color', 'border-top-color', 'border-right-color',
        'border-bottom-color', 'border-left-color', 'text-decoration-color', 'outline-color'];
      // Read all original styles before writing any overrides: inherited colors
      // must never be transformed twice. Keep geometry, fonts and content intact.
      const snapshots = [root, document.body, ...document.body.querySelectorAll('*')]
        .filter(element => element instanceof HTMLElement && !element.matches('script,style,link,meta'))
        .map(element => {
          const style = getComputedStyle(element);
          return { element, colors:properties.map((property, index) => {
            if (index >= 2 && index <= 5 && parseFloat(style.getPropertyValue(property.replace('color', 'width'))) === 0) return null;
            if (index === 6 && style.textDecorationLine === 'none') return null;
            if (index === 7 && style.outlineStyle === 'none') return null;
            return rgb(style.getPropertyValue(property));
          }) };
        });
      const backgrounds = new Map();
      for (const { element, colors } of snapshots) {
        const inherited = backgrounds.get(element.parentElement) || baseBackground;
        const background = colors[1];
        const mapped = background?.[3] ? mapColor(background, 'background') : inherited;
        const alpha = background?.[3] ?? 0;
        const effective = mapped.map((channel, index) => channel * alpha + inherited[index] * (1 - alpha));
        backgrounds.set(element, effective);
        colors.forEach((color, index) => {
          if (!color || color[3] === 0) return;
          const role = index === 1 ? 'background' : index === 0 || index === 6 ? 'text' : 'border';
          override(element, properties[index], cssColor(mapColor(color, role, effective), role === 'text' ? 1 : color[3]));
        });
      }
      // Transparent documents also need opaque dark paper behind their content.
      if (!snapshots[0]?.colors[1]?.[3]) override(root, 'background-color', cssColor(baseBackground));
    }
    root.dataset.contentTheme = dark ? 'dark' : 'light';
    root.removeAttribute('data-content-theme-pending');
    if (dark) observe();
  }

  function applyTheme(theme) {
    if (initialized && dark === (theme === 'dark')) return;
    initialized = true;
    dark = theme === 'dark';
    if (pending) cancelAnimationFrame(pending);
    pending = 0;
    if (pdf) root.dataset.contentTheme = dark ? 'dark' : 'light';
    else paint();
  }

  window.addEventListener('message', event => {
    if (event.source === parent && event.data?.type === 'onenote-content-theme') applyTheme(event.data.theme);
  });
  if (!pdf) {
    const style = document.createElement('style');
    style.textContent = `
      html[data-content-theme="dark"] { color-scheme:dark; scrollbar-color:#625a6c #1f1e24; }
      html[data-content-theme="dark"] ::selection { background:#735093; color:#fff; }
      html[data-content-theme="dark"] :is(img,video) { filter:brightness(.82); }
    `;
    document.head.append(style);
    // Re-read colors after linked stylesheets/images finish loading.
    window.addEventListener('load', () => { if (dark) paint(); });
  }
  applyTheme(root.dataset.contentTheme || new URLSearchParams(location.search).get('theme'));
}());
