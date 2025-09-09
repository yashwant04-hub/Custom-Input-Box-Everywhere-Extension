const GEMINI_API_KEY = "AIzaSyBDR32ToYGPU9zyhLElkmeN_GwXNg3JrX8";
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ADVANCED_PROMPT" || message.type === "ADVANCED_QUERY") {
        const prompt = message.prompt;

        fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        })
            .then(res => res.json())
            .then(data => {
                const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ No reply from Gemini.";
                sendResponse({ text: reply });
            })
            .catch(err => {
                console.error("Gemini error:", err);
                sendResponse({ text: "⚠️ Error talking to Gemini." });
            });

        return true; // keep port open for async
    }

    // FROM POPUP: Get prompt and apply CSS script
    if (message.action === "call_llm_for_styling" || message.action === "popup_prompt" || message.action === "retry_script_with_error") {
        console.log("🧠 Calling Gemini LLM with extracted data...");
        callGeminiAndGetStylingScript(message.payload, message.action).then(jsCode => {
            const tabId = sender?.tab?.id;
            if (tabId) {
                sendStylingScriptToTab(tabId, jsCode);
            } else {
                // fallback: get current active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const fallbackTabId = tabs[0]?.id;
                    if (fallbackTabId) {
                        sendStylingScriptToTab(fallbackTabId, jsCode);
                    } else {
                        console.error("❌ Could not determine active tab ID.");
                    }
                });
            }
        });
    }
    
});

function sendStylingScriptToTab(tabId, jsCode) {
    chrome.tabs.sendMessage(tabId, {
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
    function getDataForTab(tabId) {
        return new Promise((resolve) => {
            chrome.storage.local.get([`tab_${tabId}`], (result) => {
                resolve(result[`tab_${tabId}`]);
            });
        });
    }

    const tab = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]);
        });
    });
    const tabId = tab.id;

    let user_context = "";
    // if (user_action === "retry_script_with_error") {
    //     prompt = `
    // The following script caused an error and needs to be fixed:
    
    // Error: ${payload.error_message}
    
    // Script:
    // ${payload.previous_script}
    
    // Please correct the JavaScript and return only the valid script.
    // `;
    //   }

    if (user_action === "call_llm_for_styling") {
        console.log("call_llm_for_styling triggered.")
        await new Promise((resolve) => {
            chrome.storage.local.set({ [`tab_${tabId}`]: extractedData }, resolve);
        });
        return
        // mapper = {"youtube": "make all text brown.", "google": "make all icons red"}
        // url = "www.youtube.com"
        // for key, value in mapper:
        //     key in url:
        //         user_context = value

        user_context = `You are a frontend assistant. Given the following extracted input fields and surrounding texts:

${JSON.stringify(extractedData, null, 2)}

Generate a complete JavaScript snippet that updates ONLY the **background color**, **font styles**, and **border colors** of relevant input, textarea, and editable text fields.

Do not add icons, placeholder text, or any other visual elements.  
Return ONLY a self-contained JavaScript snippet that can be directly executed in the browser.`;

    } 
    if (user_action === "popup_prompt") {
        const savedData = await getDataForTab(tabId);
        console.log("savedData", savedData)

        user_context = `You are a frontend assistant. Given the following extracted input fields and surrounding texts:

${JSON.stringify(savedData, null, 2)}

Generate a complete JavaScript snippet that updates ONLY CSS of the things mentioned in following text.

${JSON.stringify(extractedData, null, 2)}

Do not add any additional thing other than modifying small CSS contents.  
Return ONLY a self-contained JavaScript snippet that can be directly executed in the browser.`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [
                {
                    role: "user",
                    parts: [{ text: user_context }]
                }
            ],
            generationConfig: { temperature: 0.7 }
        })
    });

    const json = await response.json();
    let jsCode = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    jsCode = jsCode.replace(/```(?:javascript)?\s*/gi, "").replace(/```$/g, "").trim();

    console.log("🧾 Final JS Code to inject:\n", jsCode);
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
