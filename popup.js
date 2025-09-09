function getUrlCacheKey(tab, cache_type) {
    try {
        const tabUrl = tab?.url
        const url = new URL(tabUrl);
        const key = `${url.hostname}${url.pathname}`;
        return `cache_${tab.id}_${key}_${cache_type}`;
    } catch (err) {
        console.error("❌ Invalid URL for cache key:", tabUrl);
        return null;
    }
}


function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}


function renderSuggestions(suggestions) {
    const suggestionsBox = document.getElementById("suggestionsBox");
    // const inputBox = document.getElementById("promptInput");

    suggestionsBox.innerHTML = "";

    suggestions.forEach(({ short_description, descriptive_prompt }) => {
        const btn = document.createElement("button");
        btn.textContent = short_description;
        btn.style.cssText = `
            padding: 6px 10px;
            font-size: 13px;
            background-color: #2d2d2d;
            color: #fff;
            border: 1px solid #ccc;
            border-radius: 6px;
            cursor: pointer;
            text-align: left;
        `;

        btn.onclick = () => {
            // inputBox.value = descriptive_prompt;
            console.log("")

            browser.runtime.sendMessage({
                action: "suggestion_clicked",
                payload: descriptive_prompt
            });
        };

        suggestionsBox.appendChild(btn);
    });
}


document.addEventListener("DOMContentLoaded", async () => {
    const apiKeyContainer = document.getElementById("apiKeyContainer");

    // Check for API key
    const { userApiKey } = await browser.storage.local.get("userApiKey");

    if (!userApiKey) {
        // Show input to collect API key
        apiKeyContainer.style.display = "block";
        document.getElementById("saveApiKeyBtn").addEventListener("click", async () => {
        const key = document.getElementById("apiKeyInput").value.trim();
        if (!key) {
            alert("API key is required.");
            return;
        }
        await browser.storage.local.set({ userApiKey: key });
        alert("API key saved! Reopen the popup.");
        });
        return; // Exit early — do not show the rest of the UI
    }

    // Hide key input UI and show rest of the UI
    apiKeyContainer.style.display = "none";
    const toggleBtn = document.getElementById("toggle-mode");
    const sendBtn = document.getElementById("sendPromptBtn");
    const inputBox = document.getElementById("promptInput");
    const advancedBox = document.getElementById("advancedBox");

    let currentMode = "habit";

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const suggestionKey = getUrlCacheKey(tabs[0], "styling_prompt_suggestions")

    // Load mode from storage
    browser.storage.local.get("mode").then((data) => {
        currentMode = data.mode || "habit";
        updateUI(currentMode);
    });

    // Load existing suggestions for this tab
    browser.storage.local.get(suggestionKey).then((data) => {
        const suggestions = data[suggestionKey] || [];
        renderSuggestions(suggestions);
    });

    toggleBtn.addEventListener("click", () => {
        currentMode = currentMode === "habit" ? "advanced" : "habit";
        browser.storage.local.set({ mode: currentMode });
        updateUI(currentMode);

        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            const tabId = tabs[0]?.id;
            browser.tabs.sendMessage(tabId, {
                type: "SET_STATE",
                enabled: true,
                mode: currentMode
            });

            if (currentMode === "advanced") {
                browser.tabs.sendMessage(tabId, {
                    action: "get_extracted_data_for_suggestions"
                });
            }
        });
    });

    function updateUI(mode) {
        toggleBtn.textContent =
            mode === "habit" ? "Switch to Advanced Mode" : "Switch to Habit Mode";

        advancedBox.style.display = mode === "advanced" ? "block" : "none";
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

    // Handle suggestions from background
    browser.runtime.onMessage.addListener((msg) => {
        if (msg.action === "styling_prompt_suggestions") {
            const suggestions = msg.suggestions || [];
            browser.storage.local.set({ [suggestionKey]: suggestions });
            renderSuggestions(suggestions);
        }
    });

});
