document.addEventListener('DOMContentLoaded', async () => {
    const statusText = document.getElementById('status-text');
    const toggleBtn = document.getElementById('toggle-btn');
    const channelText = document.getElementById('channel-text');

    async function getChannelId() {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab?.url?.includes('youtube.com')) {
            return null;
        }

        try {
            const results = await browser.tabs.executeScript(tab.id, {
                code: `
                    (function() {
                        const channelLink = document.querySelector('ytd-channel-name a');
                        if (channelLink?.href) {
                            const match = channelLink.href.match(/\\/(channel|c|user|@)\\/([^/?]+)/);
                            if (match) return match[2];
                        }
                        
                        const metaTag = document.querySelector('link[itemprop="url"][href*="youtube.com"]');
                        if (metaTag?.href) {
                            const match = metaTag.href.match(/\\/(channel|c|user|@)\\/([^/?]+)/);
                            if (match) return match[2];
                        }
                        
                        return null;
                    })();
                `
            });
            return results?.[0] || null;
        } catch (e) {
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
