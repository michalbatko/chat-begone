document.addEventListener('DOMContentLoaded', async () => {
    const statusText = document.getElementById('status-text');
    const toggleBtn = document.getElementById('toggle-btn');

    // 1. Load saved state (default to true/active)
    const stored = await browser.storage.local.get("chatBegoneEnabled");
    let isEnabled = stored.chatBegoneEnabled !== false; // Default true

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

    function updateUI(active) {
        if (active) {
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
