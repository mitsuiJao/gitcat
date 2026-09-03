const contentEl = document.getElementById("content");
const statusEl = document.getElementById("status");
const copyBtn = document.getElementById("btn-copy");

async function init() {
    const { gitcatText } = await chrome.storage.session.get("gitcatText");
    contentEl.textContent = gitcatText || "(no data)";
}

copyBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(contentEl.textContent);
        statusEl.textContent = "Copied";
    } catch (e) {
        statusEl.textContent = `Copy failed: ${String((e && e.message) || e)}`;
    }
});

init();
