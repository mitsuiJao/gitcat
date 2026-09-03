const btnRaw = document.getElementById("btn-raw");
const btnCopy = document.getElementById("btn-copy");
const btnSettings = document.getElementById("btn-settings");
const mainEl = document.getElementById("main");

let activeTab = null;

function setMessage(text) {
    mainEl.textContent = text;
}

function setButtonsEnabled(enabled) {
    btnRaw.disabled = !enabled;
    btnCopy.disabled = !enabled;
}

function setBusy(busy) {
    btnRaw.disabled = busy;
    btnCopy.disabled = busy;
    btnSettings.disabled = busy;
}

async function init() {
    const settings = await gitcatGetSettings();
    gitcatApplyDarkMode(settings.darkMode);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    if (!tab || !tab.url) {
        setButtonsEnabled(false);
        setMessage("Could not read the current tab");
        return;
    }

    let url;
    try {
        url = new URL(tab.url);
    } catch (e) {
        setButtonsEnabled(false);
        setMessage("Open a GitHub page");
        return;
    }

    if (url.hostname !== "github.com") {
        setButtonsEnabled(false);
        setMessage("Open a GitHub page");
        return;
    }

    setButtonsEnabled(true);
    setMessage("");
}

async function requestGenerate() {
    const response = await chrome.tabs.sendMessage(activeTab.id, { action: "gitcat:generate" });
    return response;
}

async function handleRaw() {
    setBusy(true);
    setMessage("Generating...");
    try {
        const result = await requestGenerate();
        if (!result || !result.ok) {
            setMessage((result && result.error) || "Failed to generate");
            return;
        }
        await chrome.storage.session.set({ gitcatText: result.text });
        await chrome.tabs.create({ url: chrome.runtime.getURL("raw.html") });
        setMessage("");
    } catch (e) {
        setMessage(`Error: ${String((e && e.message) || e)}`);
    } finally {
        setBusy(false);
    }
}

async function handleCopy() {
    setBusy(true);
    setMessage("Generating...");
    try {
        const result = await requestGenerate();
        if (!result || !result.ok) {
            setMessage((result && result.error) || "Failed to generate");
            return;
        }
        await navigator.clipboard.writeText(result.text);
        setMessage("Copied");
    } catch (e) {
        setMessage(`Error: ${String((e && e.message) || e)}`);
    } finally {
        setBusy(false);
    }
}

async function handleSettings() {
    const settings = await gitcatGetSettings();
    mainEl.innerHTML =
        '<label><input type="checkbox" id="chk-recursive"> Recursive (include subdirectories)</label><br>' +
        '<label><input type="checkbox" id="chk-dark"> Dark mode</label>';

    const chkRecursive = document.getElementById("chk-recursive");
    const chkDark = document.getElementById("chk-dark");
    chkRecursive.checked = settings.recursive;
    chkDark.checked = settings.darkMode;

    chkRecursive.addEventListener("change", () => {
        gitcatSetSettings({ recursive: chkRecursive.checked });
    });
    chkDark.addEventListener("change", () => {
        gitcatSetSettings({ darkMode: chkDark.checked });
        gitcatApplyDarkMode(chkDark.checked);
    });
}

btnRaw.addEventListener("click", handleRaw);
btnCopy.addEventListener("click", handleCopy);
btnSettings.addEventListener("click", handleSettings);

init();
