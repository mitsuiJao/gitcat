// Content script for github.com: scrapes the current directory listing (or single
// file) and assembles a "cat"-like text dump for the popup to display/copy.

function gitcatEscapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gitcatParseCurrentPage() {
    const parts = location.pathname
        .split("/")
        .filter(Boolean)
        .map((s) => {
            try {
                return decodeURIComponent(s);
            } catch (e) {
                return s;
            }
        });

    if (parts.length < 2) {
        return null;
    }

    const owner = parts[0];
    const repo = parts[1];

    if (parts.length === 2) {
        return { mode: "dir", owner, repo, branch: null, path: "" };
    }

    const kind = parts[2];
    if (kind !== "tree" && kind !== "blob") {
        return null;
    }
    if (parts.length < 4) {
        return null;
    }

    const branch = parts[3];
    const path = parts.slice(4).join("/");

    return { mode: kind === "tree" ? "dir" : "file", owner, repo, branch, path };
}

// Returns the single path segment that `restPath` is beyond `currentPath`,
// or null if `restPath` is not a direct child of `currentPath`.
function gitcatRelativeChild(restPath, currentPath) {
    if (currentPath === "") {
        if (restPath === "" || restPath.includes("/")) {
            return null;
        }
        return restPath;
    }
    const prefix = currentPath + "/";
    if (!restPath.startsWith(prefix)) {
        return null;
    }
    const remainder = restPath.slice(prefix.length);
    if (remainder === "" || remainder.includes("/")) {
        return null;
    }
    return remainder;
}

function gitcatScrapeChildren(owner, repo, branch, path) {
    const regex = new RegExp(
        `^/${gitcatEscapeRegExp(owner)}/${gitcatEscapeRegExp(repo)}/(tree|blob)/([^/]+)/(.*)$`
    );

    const anchors = document.querySelectorAll("a[href]");
    const seen = new Map();
    let resolvedBranch = branch;

    for (const anchor of anchors) {
        const raw = anchor.getAttribute("href");
        if (!raw) continue;

        let decoded;
        try {
            decoded = decodeURIComponent(raw);
        } catch (e) {
            decoded = raw;
        }

        const m = decoded.match(regex);
        if (!m) continue;

        const linkBranch = m[2];
        const restPath = m[3];

        if (resolvedBranch === null) {
            resolvedBranch = linkBranch;
        } else if (linkBranch !== resolvedBranch) {
            continue;
        }

        const rel = gitcatRelativeChild(restPath, path);
        if (rel === null) continue;

        const childPath = path ? `${path}/${rel}` : rel;
        const type = m[1] === "tree" ? "dir" : "file";

        if (!seen.has(childPath)) {
            seen.set(childPath, { type, path: childPath });
        }
    }

    return { branch: resolvedBranch, children: Array.from(seen.values()) };
}

async function gitcatFetchRawText(owner, repo, branch, path) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/raw/${encodeURIComponent(
        branch
    )}/${encodedPath}`;
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) {
        throw new Error(`fetch failed: ${res.status}`);
    }
    return await res.text();
}

async function gitcatGenerate() {
    const parsed = gitcatParseCurrentPage();
    if (!parsed) {
        return { ok: false, error: "This doesn't look like a GitHub repository or directory page" };
    }

    if (parsed.mode === "file") {
        const isBinary = gitcatIsBinaryPath(parsed.path);
        let items;
        if (isBinary) {
            items = [{ type: "file", path: parsed.path, binary: true }];
        } else {
            const content = await gitcatFetchRawText(
                parsed.owner,
                parsed.repo,
                parsed.branch,
                parsed.path
            );
            items = [{ type: "file", path: parsed.path, content }];
        }
        const meta = {
            owner: parsed.owner,
            repo: parsed.repo,
            branch: parsed.branch,
            path: parsed.path,
        };
        return { ok: true, text: gitcatFormatOutput(items, meta), meta };
    }

    const { branch, children } = gitcatScrapeChildren(
        parsed.owner,
        parsed.repo,
        parsed.branch,
        parsed.path
    );

    if (!branch || children.length === 0) {
        return {
            ok: false,
            error: "Directory not found (this may not be a repository page)",
        };
    }

    children.sort((a, b) => a.path.localeCompare(b.path));

    const items = [];
    for (const child of children) {
        if (child.type === "dir") {
            items.push({ type: "dir", path: child.path });
            continue;
        }
        if (gitcatIsBinaryPath(child.path)) {
            items.push({ type: "file", path: child.path, binary: true });
            continue;
        }
        try {
            const content = await gitcatFetchRawText(parsed.owner, parsed.repo, branch, child.path);
            items.push({ type: "file", path: child.path, content });
        } catch (e) {
            items.push({ type: "file", path: child.path, binary: true });
        }
    }

    const meta = {
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        path: parsed.path,
        count: items.length,
    };
    return { ok: true, text: gitcatFormatOutput(items, meta), meta };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === "gitcat:generate") {
        gitcatGenerate()
            .then(sendResponse)
            .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
        return true; // keep the message channel open for the async response
    }
    return undefined;
});
