/**
 * Arabic Tashkeel Extension - Background Script
 *
 * This script handles communication with the local CATT server
 * for Arabic text diacritization.
 */

// Server configuration
const SERVER_URL = 'http://localhost:5000';
const DIACRITIZE_ENDPOINT = `${SERVER_URL}/diacritize`;
const HEALTH_ENDPOINT = `${SERVER_URL}/health`;

// Server health status
let serverHealthy = false;

/**
 * Check if the local server is running and healthy
 */
async function checkServerHealth() {
    try {
        const response = await fetch(HEALTH_ENDPOINT, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            serverHealthy = data.model_loaded;
            console.log('✅ Server health check passed:', data);
            return true;
        } else {
            serverHealthy = false;
            console.error('❌ Server health check failed:', response.status);
            return false;
        }
    } catch (error) {
        serverHealthy = false;
        console.error('❌ Could not connect to server:', error.message);
        return false;
    }
}

/**
 * Diacritize Arabic text using the local CATT server
 */
async function diacritizeText(text) {
    try {
        const response = await fetch(DIACRITIZE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.diacritized;
    } catch (error) {
        console.error('❌ Diacritization error:', error);
        throw error;
    }
}

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
    // Check server health before injecting content script
    const healthy = await checkServerHealth();

    if (!healthy) {
        // Show notification if server is not running
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/images/aleph_48.png',
            title: 'Arabic Tashkeel Server Not Running',
            message: 'Please start the local server first. Run: python3 server/tashkeel_server.py'
        });
        return;
    }

    // Inject and execute content script
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
    });
});

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.text) {
        // Process the text asynchronously
        diacritizeText(request.text)
            .then(result => {
                sendResponse({ processed: result });
            })
            .catch(error => {
                sendResponse({
                    processed: 'error',
                    error: error.message
                });
            });

        // Return true to indicate async response
        return true;
    }
});

/**
 * Check server health on extension startup
 */
chrome.runtime.onStartup.addListener(() => {
    checkServerHealth();
});

// Initial health check
checkServerHealth();

console.log('🚀 Arabic Tashkeel Extension loaded');
console.log('📡 Server URL:', SERVER_URL);
