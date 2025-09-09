// const GEMINI_API_KEY = "AIzaSyBDR32ToYGPU9zyhLElkmeN_GwXNg3JrX8";
let enabled = true;
let mode = "habit";

// Log startup
console.log("✅ Background script running");

function broadcast(tabId) {
    chrome.tabs.sendMessage(tabId, {
        type: "SET_STATE",
        enabled,
        mode
    });
}

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

function getDataForUrl(tab, cache_type) {
    return new Promise((resolve) => {
        const cacheKey = getUrlCacheKey(tab, cache_type);
        if (!cacheKey) {
            resolve(null);
            return;
        }

        chrome.storage.local.get([cacheKey], (result) => {
            resolve(result[cacheKey]);
        });
    });
}

function setDataForUrl(tab, cache_type, cache_data) {
    const cacheKey = getUrlCacheKey(tab, cache_type);
    return new Promise((resolve) => {
        chrome.storage.local.set({ [cacheKey]: cache_data }, resolve);
    });
}

async function getCurrentActiveTab(){
    const tab = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]);
        });
    });
    return tab
}

async function callGeminiWithPrompt(prompt) {
    const { userApiKey } = await browser.storage.local.get("userApiKey");
    if (!userApiKey) {
        console.warn("API key not found.");
        return;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${userApiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: { temperature: 0.7 }
        })
    });

    return response
}

async function callGeminiGetJavascript(prompt) {
    response = await callGeminiWithPrompt(prompt)
    const json = await response.json();
    let jsCode = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    jsCode = jsCode.replace(/```(?:javascript)?\s*/gi, "").replace(/```$/g, "").trim();
    return jsCode;
}

function GetJsonFromGeminiResponse(gemini_reponse) {

    gemini_reponse = gemini_reponse
        .trim()
        .replace(/^json\s*/i, "")                   // ← This line handles your current case!
        .replace(/^```json\s*/i, "")                // If it starts with ```json
        .replace(/^```\s*/i, "")                    // If it starts with ```
        .replace(/```$/, "")                        // Remove trailing ```
        .trim();

    try {
        return JSON.parse(gemini_reponse);
    } catch (e) {
        console.error("❌ Failed to parse Gemini JSON:", e);
        console.log("🧾 json Gemini text returned:\n", gemini_reponse); // this will show you what went wrong
    }
    return null
}

// ICON TOGGLE
chrome.browserAction.onClicked.addListener((tab) => {
    enabled = !enabled;
    broadcast(tab.id);
    console.log("[ICON] Extension Enabled:", enabled, "Mode:", mode);
});

// ON STARTUP INIT
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(["mode"], (data) => {
        mode = data.mode || "habit";
    });
});

// CONTEXT MENU TOGGLE
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "toggleMode",
        title: "Toggle Habit/Advanced Mode",
        contexts: ["all"]
    });

    chrome.storage.local.set({ mode: "habit" });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "toggleMode") {
        mode = mode === "habit" ? "advanced" : "habit";
        chrome.storage.local.set({ mode });
        broadcast(tab.id);
    }
});

// KEYBOARD SHORTCUT TOGGLE
chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle_mode") {
        mode = mode === "habit" ? "advanced" : "habit";
        chrome.storage.local.set({ mode });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                broadcast(tabs[0].id);
            }
        });
    }
});


// === GEMINI PROMPT HANDLER (HABIT & AI LOGIC COMBINED) ===
chrome.runtime.onMessage.addListener( (message, sender, sendResponse) => {

    if (message.action === "call_llm_for_styling" || message.action === "popup_prompt" || message.action === "retry_script_with_error" || message.action === "suggestion_clicked") {
        console.log("🧠 Calling Gemini LLM with extracted data...");

        callGeminiAndGetStylingScript(message.payload, message.action).then(async (jsCode) => {
            let tab = sender?.tab;
            if (!tab) {
                tab = await getCurrentActiveTab()
            } 
            const tabId = tab.id
            if (jsCode){
                sendStylingScriptToTab(tab, jsCode);
            }
            if (message.action === "call_llm_for_styling" || message.action === "popup_prompt") {
                setDataForUrl(tab, "styling_elements", message.payload)
                callGeminiAndGetStylingScript(message.payload, "suggest_styling_prompts").then(jsCode => {
                    let suggestions = GetJsonFromGeminiResponse(jsCode)
                    if (tab) {
                        setDataForUrl(tab, "styling_prompt_suggestions", suggestions)
                        chrome.runtime.sendMessage({
                            action: "styling_prompt_suggestions",
                            tabId,
                            suggestions
                        });
                    }
                });
            }
        });
    }

});

function sendStylingScriptToTab(tab, jsCode) {
    if (!tab || !tab.id){
        return
    }
    chrome.tabs.sendMessage(tab.id, {
        action: "apply_styling_script",
        script: jsCode
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("❌ Error sending script to content:", chrome.runtime.lastError.message);
        } else {
            console.log("✅ Styling script sent to content.");
        }
    });
}


async function callGeminiAndGetStylingScript(extractedData, user_action = "") {


    const tab = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]);
        });
    });
    const tabUrl = tab?.url;

    let user_context = "";

    if (user_action === "call_llm_for_styling" || user_action === "popup_prompt") {
        return ""
    }
    if (user_action === "suggestion_clicked") {
        const savedData = await getDataForUrl(tab, "styling_elements");

        user_context = `You are a frontend assistant. Given the following extracted input fields and surrounding texts:

${JSON.stringify(savedData, null, 2)}

Generate a complete JavaScript snippet that updates ONLY CSS of the things mentioned in following text.

${JSON.stringify(extractedData, null, 2)}

Do not add any additional thing other than modifying small CSS contents.  
Return ONLY a self-contained JavaScript snippet that can be directly executed in the browser.`;
    }
    if (user_action === "suggest_styling_prompts") {

        const savedData = await getDataForUrl(tab, "styling_elements");

        user_context = `You are a creative frontend assistant.

Given the following website: "${tabUrl}"  
and this structure of the page:
${JSON.stringify(savedData, null, 2)}

Suggest exactly **5 creative CSS styling prompts** a user might want to try on this page.
"${extractedData}"
Return only a **strictly valid JSON array** of 5 objects.  
Each object must have:
- "short_description": a concise title (max 6 words) like "Dark Mode with Neon Search"
- "descriptive_prompt": a detailed request for how the page should visually change, such as "Convert the page to a full dark mode with a black background and white text. Make the search box glow with a blue neon outline and animated pulsing effect."

⚠️ Important:
- DO NOT include markdown, explanation, or any wrapper text.
- DO NOT wrap the output in triple backticks.
- Your response must be directly parsable using JSON.parse() with no pre/post text.

Example of desired output:

[
  {
    "short_description": "Dark Mode with Neon Search",
    "descriptive_prompt": "Convert the page to a full dark mode with a black background and white text. Make the search box glow with a blue neon outline and animated pulsing effect."
  },
  {
    "short_description": "Comic Sans Takeover",
    "descriptive_prompt": "Change all fonts on the page to Comic Sans MS and add a playful background image like balloons or confetti."
  },
  ...
]
`;

    }

    console.log("check user_context", user_context)
    jsCode = callGeminiGetJavascript(user_context)
    // console.log("🧾 Final JS Code to inject:\n", jsCode);
    return jsCode;
}

// Re-inject script on tab activation or load
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, tab => {
        if (tab.url?.startsWith("http")) {
            chrome.tabs.executeScript(tab.id, { file: "content.js" });
        }
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active && tab.url.startsWith("http")) {
        console.log("🌐 Injecting content.js into:", tab.url);
        chrome.tabs.executeScript(tabId, { file: "content.js" }, () => {
            if (chrome.runtime.lastError) {
                console.warn("❌ Script injection failed:", chrome.runtime.lastError.message);
            } else {
                console.log("✅ Script injected successfully.");
            }
        });
    }
});
