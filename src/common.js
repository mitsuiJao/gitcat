// Shared utilities for gitcat (used by content scripts and the raw page)

const GITCAT_BINARY_EXTENSIONS = new Set([
    // images
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "tiff", "tif",
    // archives
    "zip", "tar", "gz", "tgz", "bz2", "7z", "rar", "xz",
    // executables / libraries
    "exe", "dll", "so", "dylib", "bin", "o", "a", "lib", "class", "jar", "wasm",
    // fonts
    "woff", "woff2", "ttf", "otf", "eot",
    // audio / video
    "mp3", "mp4", "wav", "ogg", "mov", "avi", "mkv", "flac", "webm",
    // documents
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    // design
    "psd", "ai", "sketch", "fig",
    // databases / misc binary
    "db", "sqlite", "sqlite3", "pyc", "iso", "dmg", "apk", "ipa"
]);

function gitcatIsBinaryPath(path) {
    const name = path.split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    if (dot === -1 || dot === name.length - 1) {
        return false;
    }
    const ext = name.slice(dot + 1).toLowerCase();
    return GITCAT_BINARY_EXTENSIONS.has(ext);
}

// items: [{ type: "file"|"dir", path: string, content?: string, binary?: boolean }]
// meta: { owner, repo, branch, path }
function gitcatFormatOutput(items, meta) {
    const lines = [];
    lines.push(`Repository: ${meta.owner}/${meta.repo}`);
    lines.push(`Path: ${meta.path || "(root)"}`);
    lines.push(`Branch: ${meta.branch}`);
    lines.push("=".repeat(50));
    lines.push("");

    for (const item of items) {
        if (item.type === "dir") {
            lines.push(`[DIRECTORY] ${item.path}/`);
            lines.push("");
        } else if (item.binary) {
            lines.push(`[BINARY FILE] ${item.path}`);
            lines.push("");
        } else {
            lines.push(`===== FILE: ${item.path} =====`);
            lines.push(item.content ?? "");
            lines.push(`===== END FILE: ${item.path} =====`);
            lines.push("");
        }
    }

    return lines.join("\n");
}
