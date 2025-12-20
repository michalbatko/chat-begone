document.addEventListener('DOMContentLoaded', async () => {
    const statusText = document.getElementById('status-text');
    const toggleBtn = document.getElementById('toggle-btn');
    const channelText = document.getElementById('channel-text');

    async function getChannelId() {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab || !tab.url) {
            return null;
        }

        let hostname;
        try {
            const parsedUrl = new URL(tab.url);
            hostname = parsedUrl.hostname;
        } catch (e) {
            return null;
        }

        const allowedHosts = [
            'www.youtube.com',
            'youtube.com',
            'm.youtube.com',
            'music.youtube.com',
            'studio.youtube.com'
        ];

        if (!allowedHosts.includes(hostname)) {
            return null;
        }

        try {
            console.log('Attempting to detect channel...');
            const results = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    console.log('Chat Begone: Starting channel detection...');

                    // Helper to extract ID from URL
                    const extractId = (url) => {
                        console.log('Chat Begone: Checking URL:', url);
                        if (!url) return null;

                        // Regex explanation:
                        // 1. \/ Match leading slash
                        // 2. (channel\/|c\/|user\/|@) Match path prefix (with trailing slash for paths, or @ for handles)
                        // 3. ([^/?]+) Match the ID part (stop at / or ?)
                        const match = url.match(/\/(channel\/|c\/|user\/|@)([^/?]+)/);
                        const result = match ? match[2] : null;
                        if (result) console.log('Chat Begone: Extracted ID:', result);
                        return result;
                    };

                    // Strategy 1: Video Owner Renderer (Standard Watch Page)
                    const ownerLink = document.querySelector('ytd-video-owner-renderer ytd-channel-name a');
                    if (ownerLink?.href) {
                        console.log('Chat Begone: Found owner link strategy');
                        const id = extractId(ownerLink.href);
                        if (id) return id;
                    }

                    // Strategy 2: Any Channel Name Link (Fallback)
                    const channelLink = document.querySelector('ytd-channel-name a');
                    if (channelLink?.href) {
                        console.log('Chat Begone: Found generic channel link strategy');
                        const id = extractId(channelLink.href);
                        if (id) return id;
                    }

                    // Strategy 3: Meta tags
                    const metaUrl = document.querySelector('link[itemprop="url"][href*="youtube.com"]');
                    if (metaUrl?.href) {
                        console.log('Chat Begone: Found meta tag strategy');
                        const id = extractId(metaUrl.href);
                        if (id) return id;
                    }

                    // Strategy 4: Channel Page URL (if we are on a channel page)
                    if (window.location.href.match(/\/(channel|c|user|@)\//)) {
                        console.log('Chat Begone: Found URL strategy');
                        const id = extractId(window.location.href);
                        if (id) return id;
                    }

                    console.log('Chat Begone: All strategies failed');
                    return null;
                }
            });

            const result = results?.[0]?.result ?? null;
            console.log('Channel ID detected:', result);
            return result;
        } catch (e) {
            console.error('Channel detection error:', e);
            return null;
        }
    }

    const channelId = await getChannelId();
    if (channelId) {
        channelText.textContent = channelId;
    } else {
        channelText.textContent = 'Not detected';
        channelText.style.color = 'gray';
    }

    // 1. Load saved state (default to false/inactive)
    const stored = await browser.storage.local.get("chatBegoneEnabled");
    let isEnabled = stored.chatBegoneEnabled === true; // Default false

    updateUI(isEnabled);

    // 2. Button Click Handler
    toggleBtn.addEventListener('click', async () => {
        isEnabled = !isEnabled;

        // Save to storage
        await browser.storage.local.set({ chatBegoneEnabled: isEnabled });

        // Update UI
        updateUI(isEnabled);

        // Notify content script
        // We query for active tabs in current window to send the message
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        for (const tab of tabs) {
            // We catch errors in case the content script isn't loaded on this tab
            try {
                await browser.tabs.sendMessage(tab.id, {
                    action: "toggleState",
                    isEnabled: isEnabled
                });
            } catch (e) {
                // Ignore errors (e.g. user toggles on a non-YouTube tab)
            }
        }
    });

    function updateUI(isEnabled) {
        if (isEnabled) {
            statusText.textContent = "Active";
            statusText.style.color = "green";
            toggleBtn.textContent = "Turn OFF";
            toggleBtn.classList.remove("inactive");
        } else {
            statusText.textContent = "Inactive";
            statusText.style.color = "red";
            toggleBtn.textContent = "Turn ON";
            toggleBtn.classList.add("inactive"); // Makes it green (Turn ON)
        }
    }
});
