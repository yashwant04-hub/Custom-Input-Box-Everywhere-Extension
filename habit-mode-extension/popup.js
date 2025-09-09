document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("toggle-mode");
    const sendBtn = document.getElementById("sendPromptBtn");
    const inputBox = document.getElementById("promptInput");
    const advancedBox = document.getElementById("advancedBox");
  
    let currentMode = "habit";
  
    // Initialize mode from storage
    browser.storage.local.get("mode").then((data) => {
      currentMode = data.mode || "habit";
      updateUI(currentMode);
    });
  
    toggleBtn.addEventListener("click", () => {
      currentMode = currentMode === "habit" ? "advanced" : "habit";
      browser.storage.local.set({ mode: currentMode });
      updateUI(currentMode);
  
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        browser.tabs.sendMessage(tabs[0].id, {
          type: "SET_STATE",
          enabled: true,
          mode: currentMode
        });
      });
    });
  
    function updateUI(mode) {
      toggleBtn.textContent =
        mode === "habit" ? "Switch to Advanced Mode" : "Switch to Habit Mode";
  
      if (mode === "advanced") {
        advancedBox.style.display = "block";
      } else {
        advancedBox.style.display = "none";
      }
    }
  
    if (sendBtn && inputBox) {
      sendBtn.addEventListener("click", () => {
        const prompt = inputBox.value.trim();
  
        if (!prompt) {
          alert("Please enter a prompt.");
          return;
        }
  
        browser.runtime.sendMessage({
          action: "popup_prompt",
          payload: prompt
        });
      });
    }
  });
  