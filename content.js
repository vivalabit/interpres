(() => {
  let popupHost = null;
  let shadowRootRef = null;
  let refs = null;
  let activeRequestId = 0;
  let isVisible = false;
  let latestSelection = null;

  function initPopup() {
    if (popupHost) {
      return;
    }

    popupHost = document.createElement("div");
    popupHost.style.position = "fixed";
    popupHost.style.top = "0";
    popupHost.style.left = "0";
    popupHost.style.zIndex = "2147483647";
    popupHost.style.display = "none";
    popupHost.setAttribute("data-selection-translator-root", "true");

    shadowRootRef = popupHost.attachShadow({ mode: "open" });

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("content.css");

    const shell = document.createElement("div");
    shell.className = "translator-shell";
    shell.innerHTML = `
      <div class="translator-card" data-placement="right">
        <button class="translator-close" type="button" aria-label="Close popup">×</button>
        <div class="translator-status" data-visible="false" data-variant="loading"></div>

        <section class="translator-section" data-section="translation">
          <h3 class="translator-title">Translation</h3>
          <p class="translator-text" data-role="translation"></p>
          <p class="translator-meta" data-role="source-language"></p>
        </section>

        <section class="translator-section" data-section="interesting">
          <h3 class="translator-title">Quick Insights</h3>
          <ul class="translator-list" data-role="interesting-points"></ul>
        </section>

        <section class="translator-section" data-section="explanation">
          <h3 class="translator-title">Explanation</h3>
          <p class="translator-text" data-role="explanation"></p>
        </section>
      </div>
    `;

    shadowRootRef.append(stylesheet, shell);
    document.documentElement.appendChild(popupHost);

    refs = {
      shell,
      card: shell.querySelector(".translator-card"),
      closeButton: shell.querySelector(".translator-close"),
      status: shell.querySelector(".translator-status"),
      translationSection: shell.querySelector('[data-section="translation"]'),
      interestingSection: shell.querySelector('[data-section="interesting"]'),
      explanationSection: shell.querySelector('[data-section="explanation"]'),
      translation: shell.querySelector('[data-role="translation"]'),
      sourceLanguage: shell.querySelector('[data-role="source-language"]'),
      interestingPoints: shell.querySelector('[data-role="interesting-points"]'),
      explanation: shell.querySelector('[data-role="explanation"]')
    };

    refs.closeButton.addEventListener("click", hidePopup);

    document.addEventListener("mousedown", handleDocumentPointerDown, true);
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("scroll", hidePopup, true);
    window.addEventListener("resize", hidePopup);
    document.addEventListener("mouseup", updateLatestSelectionFromDocument);
    document.addEventListener("keyup", updateLatestSelectionFromDocument);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  function handleSelectionChange() {
    updateLatestSelectionFromDocument();

    const selection = window.getSelection();
    if (!selection || selection.toString().trim()) {
      return;
    }

    hidePopup();
  }

  function handleDocumentPointerDown(event) {
    if (!isVisible || !popupHost) {
      return;
    }

    if (event.composedPath().includes(popupHost)) {
      return;
    }

    hidePopup();
  }

  function getSelectionInfo() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) {
      return null;
    }

    const rect = getSelectionRect(selection);
    if (!rect) {
      return null;
    }

    return { text, rect };
  }

  function getSelectionRect(selection) {
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect && rect.width !== 0 && rect.height !== 0) {
        return rect;
      }

      const rects = range.getClientRects();
      return rects.length ? rects[0] : null;
    } catch (error) {
      return null;
    }
  }

  function handleRuntimeMessage(message, _sender, sendResponse) {
    if (!message?.type?.startsWith("selection-translator:")) {
      return;
    }

    if (message.type === "selection-translator:ping") {
      sendResponse({ ok: true });
      return true;
    }

    initPopup();

    const selectionInfo = getSelectionForMessage(message.text, message.rect);
    if (!selectionInfo) {
      return;
    }

    activeRequestId += 1;

    if (message.type === "selection-translator:loading") {
      renderStatus({
        message: "Translating and preparing explanation...",
        variant: "loading",
        rect: selectionInfo.rect
      });
      return;
    }

    if (message.type === "selection-translator:error") {
      renderStatus({
        message: message.error || "Could not complete the translation",
        variant: "error",
        rect: selectionInfo.rect
      });
      return;
    }

    if (message.type === "selection-translator:result") {
      renderResult(message.data, selectionInfo.rect);
    }

    return false;
  }

  function renderStatus({ message, variant, rect }) {
    refs.status.textContent = message;
    refs.status.dataset.visible = "true";
    refs.status.dataset.variant = variant;

    refs.translationSection.style.display = "none";
    refs.interestingSection.style.display = "none";
    refs.explanationSection.style.display = "none";

    showPopupAtRect(rect);
  }

  function renderResult(data, rect) {
    refs.status.textContent = "";
    refs.status.dataset.visible = "false";
    refs.status.dataset.variant = "loading";

    refs.translationSection.style.display = "";
    refs.interestingSection.style.display = "";
    refs.explanationSection.style.display = "";

    refs.translation.textContent = data.translation || "";
    refs.sourceLanguage.textContent = `Source language: ${data.detected_source_language || "Unknown"}`;
    refs.explanation.textContent = data.simple_explanation || "";

    refs.interestingPoints.replaceChildren();
    for (const point of Array.isArray(data.interesting_points) ? data.interesting_points : []) {
      const listItem = document.createElement("li");
      listItem.textContent = point;
      refs.interestingPoints.appendChild(listItem);
    }

    showPopupAtRect(rect);
  }

  function showPopupAtRect(rect) {
    popupHost.style.display = "block";
    popupHost.style.visibility = "hidden";
    popupHost.style.top = "0";
    popupHost.style.left = "0";

    requestAnimationFrame(() => {
      const cardRect = refs.card.getBoundingClientRect();
      const placement = computePlacement(rect, cardRect.width, cardRect.height);

      refs.card.dataset.placement = placement.side;
      popupHost.style.left = `${placement.left}px`;
      popupHost.style.top = `${placement.top}px`;
      popupHost.style.visibility = "visible";
      isVisible = true;
    });
  }

  function computePlacement(anchorRect, popupWidth, popupHeight) {
    const gap = 12;
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const centeredTop = clamp(
      anchorRect.top + anchorRect.height / 2 - popupHeight / 2,
      margin,
      viewportHeight - popupHeight - margin
    );

    const canPlaceRight = anchorRect.right + gap + popupWidth <= viewportWidth - margin;
    if (canPlaceRight) {
      return {
        side: "right",
        left: Math.min(anchorRect.right + gap, viewportWidth - popupWidth - margin),
        top: centeredTop
      };
    }

    const canPlaceLeft = anchorRect.left - gap - popupWidth >= margin;
    if (canPlaceLeft) {
      return {
        side: "left",
        left: Math.max(anchorRect.left - popupWidth - gap, margin),
        top: centeredTop
      };
    }

    const centeredLeft = clamp(
      anchorRect.left + anchorRect.width / 2 - popupWidth / 2,
      margin,
      viewportWidth - popupWidth - margin
    );
    const canPlaceBottom = anchorRect.bottom + gap + popupHeight <= viewportHeight - margin;

    if (canPlaceBottom) {
      return {
        side: "bottom",
        left: centeredLeft,
        top: Math.min(anchorRect.bottom + gap, viewportHeight - popupHeight - margin)
      };
    }

    return {
      side: "top",
      left: centeredLeft,
      top: Math.max(anchorRect.top - popupHeight - gap, margin)
    };
  }

  function hidePopup() {
    if (!popupHost) {
      return;
    }

    activeRequestId += 1;
    isVisible = false;
    popupHost.style.display = "none";
    popupHost.style.visibility = "hidden";
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function updateLatestSelectionFromDocument() {
    latestSelection = getSelectionInfo();
  }

  function getSelectionForMessage(textFromMessage, rectFromMessage) {
    if (rectFromMessage) {
      return {
        text: normalizeText(textFromMessage),
        rect: rectFromMessage
      };
    }

    const currentSelection = getSelectionInfo();
    if (currentSelection && isMatchingSelection(currentSelection.text, textFromMessage)) {
      latestSelection = currentSelection;
      return currentSelection;
    }

    if (latestSelection && isMatchingSelection(latestSelection.text, textFromMessage)) {
      return latestSelection;
    }

    if (currentSelection || latestSelection) {
      return currentSelection || latestSelection;
    }

    if (!normalizeText(textFromMessage)) {
      return null;
    }

    return {
      text: normalizeText(textFromMessage),
      rect: getFallbackRect()
    };
  }

  function isMatchingSelection(selectionText, textFromMessage) {
    if (!textFromMessage) {
      return true;
    }

    return normalizeText(selectionText) === normalizeText(textFromMessage);
  }

  function getFallbackRect() {
    const width = Math.min(280, Math.max(180, window.innerWidth * 0.25));
    return {
      top: 24,
      left: Math.max(16, window.innerWidth - width - 24),
      right: Math.max(16, window.innerWidth - 24),
      bottom: 48,
      width,
      height: 24
    };
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  initPopup();
})();
