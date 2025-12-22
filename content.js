let boxElement = null;
let videoElement = null;
let playerElement = null;
let resizeObserver = null;

// Default Configuration
// Blocking box's position/size relative to the video content
let config = {
    top: 89,    // %
    height: 11, // %
    left: 62,   // %
    width: 38   // %
};

let isEnabled = true;

// Channel ID state
let currentChannelId = null;

function getCurrentChannelId() {
    const channelLinkElement = document.querySelector('ytd-channel-name a');
    if (channelLinkElement?.href) {
        const match = channelLinkElement.href.match(/\/(channel|c|user|@)\/([^/?]+)/);
        if (match) return match[2];
    }

    const metaTag = document.querySelector('link[itemprop="url"][href*="youtube.com"]');
    if (metaTag?.href) {
        const match = metaTag.href.match(/\/(channel|c|user|@)\/([^/?]+)/);
        if (match) return match[2];
    }

    return null;
}

// Check if current channel is in allowlist
async function updateStateFromStorage() {
    currentChannelId = getCurrentChannelId();
    if (!currentChannelId) {
        isEnabled = false;
        return;
    }

    const stored = await browser.storage.local.get("chatBegoneChannels");
    const channels = stored.chatBegoneChannels || {};

    // If channel is present in storage, it is enabled (Allowlist behavior)
    if (channels[currentChannelId]) {
        isEnabled = true;
        // Optionally load specific config if we stored it
        if (channels[currentChannelId].config) {
            config = channels[currentChannelId].config;
        }
    } else {
        isEnabled = false;
    }

    if (isEnabled) {
        startWatchdog();
    } else {
        cleanup();
    }
}

browser.runtime.onMessage.addListener((message) => {
    if (message.action === "toggleState") {
        // Optimistic update from popup
        if (message.channelId === currentChannelId) {
            isEnabled = message.isEnabled;
            if (!isEnabled) {
                cleanup();
            } else {
                startWatchdog();
            }
        }
    }
});

// Initial load
updateStateFromStorage().catch(console.error);

// Re-check on navigation (YouTube is SPA)
setInterval(() => {
    const newChannelId = getCurrentChannelId();
    if (newChannelId !== currentChannelId) {
        updateStateFromStorage();
    }
}, 2000);

function updateBoxPosition() {
    if (!isEnabled) return;

    if (!boxElement || !videoElement || !playerElement) return;

    // Ensure elements are still connected to DOM
    if (!videoElement.isConnected || !playerElement.isConnected) {
        cleanup(); // Clear state to force re-injection
        return;
    }

    const vidRect = videoElement.getBoundingClientRect();
    const playerRect = playerElement.getBoundingClientRect();

    // Wait for video to have size
    if (vidRect.width === 0 || vidRect.height === 0) return;

    const videoTop = vidRect.top - playerRect.top;
    const videoLeft = vidRect.left - playerRect.left;
    const videoW = vidRect.width;
    const videoH = vidRect.height;

    const pxWidth = videoW * (config.width / 100);
    const pxHeight = videoH * (config.height / 100);

    const pxTop = videoTop + (videoH * (config.top / 100));
    const pxLeft = videoLeft + (videoW * (config.left / 100));

    boxElement.style.top = `${pxTop}px`;
    boxElement.style.left = `${pxLeft}px`;
    boxElement.style.width = `${pxWidth}px`;
    boxElement.style.height = `${pxHeight}px`;
    boxElement.style.display = 'block';
}

let dragStartX, dragStartY;
let startLeft, startTop;

function onMouseMove(e) {
    if (!videoElement) return;

    const vidRect = videoElement.getBoundingClientRect();
    if (vidRect.width === 0 || vidRect.height === 0) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    const deltaPercentW = (deltaX / vidRect.width) * 100;
    const deltaPercentH = (deltaY / vidRect.height) * 100;

    // Boundary Checks (Clamp)
    // Strict: Box stays fully within the video player.
    config.left = Math.max(0, Math.min(startLeft + deltaPercentW, 100 - config.width));
    config.top = Math.max(0, Math.min(startTop + deltaPercentH, 100 - config.height));

    updateBoxPosition();
}

function onMouseUp() {
    browser.storage.local.set({ chatBegoneConfig: config }).catch((err) => {
        console.error("Chat Begone: Failed to save config:", err);
    });

    cleanupDragListeners();
}

function cleanupDragListeners() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
}

function cleanup() {
    stopWatchdog();
    cleanupDragListeners();

    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;

    if (boxElement) {
        boxElement.remove();
    } else {
        // Fallback in case reference was lost but element persists
        const existing = document.getElementById("chat-begone-box");
        if (existing) existing.remove();
    }

    boxElement = null;
}

function ensureBox() {
    if (!isEnabled) return;

    const newPlayer = document.querySelector(".html5-video-player");
    const newVideo = document.querySelector("video.html5-main-video");

    // Video not ready
    if (!newPlayer || !newVideo) return;

    // Check if we migrated to a new video player instance (YouTube SPA Nav)
    if ((playerElement && playerElement !== newPlayer) ||
        (videoElement && videoElement !== newVideo)) {
        cleanup();
    }

    playerElement = newPlayer;
    videoElement = newVideo;

    let box = document.getElementById("chat-begone-box");
    if (!box) {
        box = document.createElement("div");
        box.id = "chat-begone-box";
        playerElement.appendChild(box);
        boxElement = box;

        box.addEventListener('mousedown', (e) => {
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            startLeft = config.left;
            startTop = config.top;

            // Prevent text selection/default behavior
            e.preventDefault();

            // Attach listeners only during drag
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Re-attach observer whenever we create the box
        if (resizeObserver) resizeObserver.disconnect();

        resizeObserver = new ResizeObserver(() => updateBoxPosition());
        resizeObserver.observe(playerElement);
        resizeObserver.observe(videoElement);
    } else {
        boxElement = box;
        // Ensure observer is running even if box existed (e.g. strict re-attach)
        if (!resizeObserver) {
            resizeObserver = new ResizeObserver(() => updateBoxPosition());
            resizeObserver.observe(playerElement);
            resizeObserver.observe(videoElement);
        }
    }

    updateBoxPosition();
}

let watchdogInterval = null;

function startWatchdog() {
    if (watchdogInterval) return;
    ensureBox();
    watchdogInterval = setInterval(ensureBox, 1500);
}

function stopWatchdog() {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
}

window.addEventListener('resize', () => {
    if (isEnabled) updateBoxPosition();
});
