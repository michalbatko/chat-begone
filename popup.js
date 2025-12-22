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

                    const ownerLink = document.querySelector('ytd-video-owner-renderer ytd-channel-name a');
                    if (ownerLink?.href) {
                        const id = extractId(ownerLink.href);
                        if (id) {
                            console.log('Chat Begone: Found owner link strategy with ID:', id);
                            return id;
                        }
                    }

                    console.log('Chat Begone: Owner link strategy failed');
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

    // Load saved state per channel
    let isEnabled = false;

    if (channelId) {
        const stored = await browser.storage.local.get("chatBegoneChannels");
        const channels = stored.chatBegoneChannels || {};
        // If channel is in storage, it is enabled
        isEnabled = !!channels[channelId];
    }

    updateUI(isEnabled);

    // Disable toggle if no channel detected (cannot save state for unknown channel)
    if (!channelId) {
        toggleBtn.disabled = true;
        toggleBtn.classList.add('disabled'); // Ensure CSS exists for disabled look or just browser default
        statusText.textContent = "Unknown Channel";
        statusText.style.color = "gray";
    }

    toggleBtn.addEventListener('click', async () => {
        if (!channelId) return;

        isEnabled = !isEnabled;

        // Channel Allowlist Logic:
        // Enabled -> Add to storage
        // Disabled -> Remove from storage
        const stored = await browser.storage.local.get("chatBegoneChannels");
        const channels = stored.chatBegoneChannels || {};

        if (isEnabled) {
            channels[channelId] = {
                enabled: true,
                timestamp: Date.now() // Good metadata to have
            };
        } else {
            delete channels[channelId];
        }

        await browser.storage.local.set({ chatBegoneChannels: channels });

        updateUI(isEnabled);

        // Notify content script
        // We query for active tabs in current window to send the message
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        for (const tab of tabs) {
            // We catch errors in case the content script isn't loaded on this tab
            try {
                await browser.tabs.sendMessage(tab.id, {
                    action: "toggleState",
                    channelId: channelId,
                    isEnabled: isEnabled
                });
            } catch (e) {
                // Ignore errors
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
            toggleBtn.classList.add("inactive");
        }
    }
});
