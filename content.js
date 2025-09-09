let overlayInput = null;
let targetInput = null;
let isPinned = false;
let extensionEnabled = true;
let currentMode = "habit";

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #007bff;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    z-index: 99999;
    font-family: sans-serif;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => (toast.style.opacity = 1), 10);
  setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => toast.remove(), 300);
  }, 1300);
}

function createOverlay() {
  overlayInput = document.createElement("div");
  overlayInput.id = "habit-mode-overlay";
  overlayInput.style = `
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    padding: 10px;
    width: 60%;
    border: 2px solid #007bff;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    display: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    cursor: move;
  `;

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Start typing here (Habit Mode)...";
  textarea.style = `
    width: 100%;
    border: none;
    outline: none;
    resize: none;
    font-size: 14px;
    background: transparent;
  `;

  const pinBtn = document.createElement("button");
  pinBtn.textContent = "📌";
  pinBtn.title = "Pin Overlay";
  pinBtn.style = `
    position: absolute;
    top: 5px;
    right: 5px;
    border: none;
    background: none;
    font-size: 16px;
    cursor: pointer;
    opacity: 0.4;
  `;

  pinBtn.addEventListener("click", () => {
    isPinned = !isPinned;
    pinBtn.style.opacity = isPinned ? "1" : "0.4";
  });

  overlayInput.appendChild(pinBtn);
  overlayInput.appendChild(textarea);
  document.body.appendChild(overlayInput);

  textarea.addEventListener("input", () => {
    if (targetInput) {
      targetInput.value = textarea.value;
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  makeDraggable(overlayInput);
}

function makeDraggable(el) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  el.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON") return;
    isDragging = true;
    offsetX = e.clientX - el.offsetLeft;
    offsetY = e.clientY - el.offsetTop;
    el.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    el.style.left = `${e.clientX - offsetX}px`;
    el.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    el.style.cursor = "move";
  });
}

function attachListeners() {
  const textarea = overlayInput.querySelector("textarea");

  textarea.addEventListener("keydown", (e) => {
    if (currentMode === "advanced" && e.key === "Enter" && !e.shiftKey) {
      console.log("pressed advanced");
      e.preventDefault();

      const input = textarea.value.trim();
      if (!input) return;

      textarea.value = "⏳ thinking...";
      textarea.disabled = true;

      chrome.runtime.sendMessage({ type: "ADVANCED_QUERY", prompt: input }, (response) => {
        textarea.disabled = false;
        textarea.value = response?.text || "⚠️ No response.";
        textarea.focus();
      });
    }
  });

  document.addEventListener("focusin", (e) => {
    if (!extensionEnabled || currentMode !== "habit") return;

    if (
      e.target.tagName === "TEXTAREA" ||
      (e.target.tagName === "INPUT" && e.target.type === "text")
    ) {
      targetInput = e.target;
      textarea.value = targetInput.value;
      overlayInput.style.display = "block";
      setTimeout(() => (overlayInput.style.opacity = "1"), 10);

      targetInput.addEventListener("input", () => {
        textarea.value = targetInput.value;
      });
    }
  });

  document.addEventListener("focusout", (e) => {
    if (e.target === targetInput && !isPinned) {
      overlayInput.style.opacity = "0";
      setTimeout(() => {
        overlayInput.style.display = "none";
      }, 300);
      targetInput = null;
    }
  });

  // Unified message listener for SET_STATE and styling script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SET_STATE") {
      extensionEnabled = msg.enabled;
      currentMode = msg.mode;

      console.log("[CONTENT] Mode changed to", currentMode);

      textarea.placeholder =
        currentMode === "habit"
          ? "Start typing here (Habit Mode)..."
          : "Ask me something to change the site (Advanced Mode)...";

      overlayInput.style.background =
        currentMode === "habit" ? "#fff" : "#e6f0ff";

      if (!extensionEnabled) {
        overlayInput.style.opacity = "0";
        setTimeout(() => (overlayInput.style.display = "none"), 300);
        return;
      }

      if (targetInput) {
        overlayInput.style.display = "block";
        setTimeout(() => (overlayInput.style.opacity = "1"), 10);
      }
    }

    if (msg.action === "apply_styling_script") {
      const script = msg.script?.trim();
    
      if (script) {
        try {
          console.log("✅ Executing styling script...", script);
    
          const cleanedScript = script
            .replace(/^document\.addEventListener\('DOMContentLoaded', function\(\) \{/, '')
            .replace(/\}\);$/, '');
    
          new Function(cleanedScript)(); // Try running the script
    
        } catch (err) {
          console.error("❌ Failed to execute LLM-generated script:", err);
    
          const errorMessage = err.message || "Unknown error";
    
          // Automatically ask background to retry with error feedback
          chrome.runtime.sendMessage({
            action: "retry_script_with_error",
            originalScript: script,
            error: errorMessage
          });
        }
      } else {
        console.warn("⚠️ Received empty script from background.");
      }
    }    
  });
}

// console.log("triggerLLMStylingIfAdvanced triggred")
function triggerLLMStylingIfAdvanced() {
  const elements = [];

  // ===== INPUTS, TEXTAREAS, CONTENTEDITABLES =====
  document.querySelectorAll("input, textarea, [contenteditable='true']").forEach(el => {
    let type = "unknown";
    let validations = [];

    if (el.tagName === "TEXTAREA") {
      type = "textarea";
      if (el.maxLength > 0) validations.push(`maxLength: ${el.maxLength}`);
    } else if (el.tagName === "INPUT") {
      type = `input_${el.type}`;
      if (el.maxLength > 0) validations.push(`maxLength: ${el.maxLength}`);
      if (el.min) validations.push(`min: ${el.min}`);
      if (el.max) validations.push(`max: ${el.max}`);
      if (el.required) validations.push("required");
      if (el.pattern) validations.push(`pattern: ${el.pattern}`);
    } else if (el.getAttribute("contenteditable") === "true") {
      type = "content_editable";
    }

    const computedStyle = window.getComputedStyle(el);

    elements.push({
      type,
      tag: el.tagName.toLowerCase(),
      class: el.className || "",
      id: el.id || "",
      content_type: "string",
      attributes: Array.from(el.attributes).map(attr => ({ name: attr.name, value: attr.value })),
      styles: {
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        fontSize: computedStyle.fontSize,
        fontFamily: computedStyle.fontFamily,
        border: computedStyle.border,
        padding: computedStyle.padding,
        margin: computedStyle.margin
      },
      content: el.innerText?.trim() || el.value || "",
      validations
    });
  });

  // ===== LONG TEXT NODES =====
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.textContent.trim().length > 20) return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    elements.push({
      type: "text",
      tag: "text",
      content_type: "string",
      content: walker.currentNode.textContent.trim()
    });
  }

  // ===== CARDS (divs with box-shadow or border radius or common card-like class) =====
  document.querySelectorAll("div").forEach(el => {
    const style = window.getComputedStyle(el);
    const looksLikeCard = style.boxShadow !== "none" || style.borderRadius !== "0px" || /(card|box|panel)/i.test(el.className);
    if (looksLikeCard) {
      elements.push({
        type: "card",
        tag: "div",
        class: el.className || "",
        id: el.id || "",
        content_type: "container",
        attributes: Array.from(el.attributes).map(attr => ({ name: attr.name, value: attr.value })),
        styles: {
          boxShadow: style.boxShadow,
          borderRadius: style.borderRadius,
          backgroundColor: style.backgroundColor,
          padding: style.padding,
          margin: style.margin
        },
        content: el.innerText.trim().slice(0, 100) // limit content to avoid bloat
      });
    }
  });

  // ===== IMAGES =====
  document.querySelectorAll("img").forEach(img => {
    const style = window.getComputedStyle(img);
    elements.push({
      type: "image",
      tag: "img",
      src: img.src,
      alt: img.alt || "",
      class: img.className || "",
      id: img.id || "",
      content_type: "media",
      attributes: Array.from(img.attributes).map(attr => ({ name: attr.name, value: attr.value })),
      styles: {
        width: style.width,
        height: style.height,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow
      }
    });
  });

  // ===== VIDEOS =====
  document.querySelectorAll("video").forEach(video => {
    const style = window.getComputedStyle(video);
    elements.push({
      type: "video",
      tag: "video",
      src: video.currentSrc || video.src,
      class: video.className || "",
      id: video.id || "",
      content_type: "media",
      attributes: Array.from(video.attributes).map(attr => ({ name: attr.name, value: attr.value })),
      styles: {
        width: style.width,
        height: style.height,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow
      }
    });
  });

  console.log("📦 Sending extracted DOM elements to LLM...", elements);

  chrome.runtime.sendMessage({
    action: "call_llm_for_styling",
    payload: elements
  });
}

createOverlay();
attachListeners();
triggerLLMStylingIfAdvanced();