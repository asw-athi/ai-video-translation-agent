/**
 * background.js — Service worker for the AI Translation Agent.
 *
 * Handles:
 * 1. Text translation requests from content.js
 * 2. Video audio capture via offscreen document
 * 3. Audio chunk transcription via /transcribe
 * 4. Summarization + email via /summarize
 */

const API_BASE = 'http://localhost:8000';

// ── State for audio capture ──────────────────────────────────
let transcriptions = [];
let chunkCount = 0;
let isCapturing = false;

// ── Message router ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'TRANSLATE':
            handleTranslate(message, sendResponse);
            return true; // async response

        case 'START_CAPTURE':
            handleStartCapture(sendResponse);
            return true;

        case 'STOP_AND_SUMMARIZE':
            handleStopAndSummarize(message.email, sendResponse);
            return true;

        case 'AUDIO_CHUNK':
            handleAudioChunk(message.data, message.mimeType);
            return false; // no response needed

        case 'CAPTURE_ERROR':
            console.error('[Background] Capture error:', message.error);
            isCapturing = false;
            return false;

        default:
            return false;
    }
});

// ── 1. Text Translation (existing) ──────────────────────────
async function handleTranslate(message, sendResponse) {
    const text = message.text;

    if (!text || text.trim().length === 0) {
        sendResponse({ success: false, error: 'Empty text' });
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('[Background] Backend error:', response.status, errorBody);
            sendResponse({ success: false, error: `Backend returned ${response.status}` });
            return;
        }

        const data = await response.json();
        sendResponse({ success: true, translation: data.translation });
    } catch (err) {
        console.error('[Background] Network error:', err.message);
        sendResponse({ success: false, error: err.message });
    }
}

// ── 2. Start Audio Capture ──────────────────────────────────
async function handleStartCapture(sendResponse) {
    try {
        // Clean up any previous session first
        try {
            await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP_RECORDING' });
        } catch (e) { /* no previous session */ }
        try {
            await chrome.offscreen.closeDocument();
        } catch (e) { /* no document to close */ }

        // Wait for stream release
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Reset state
        transcriptions = [];
        chunkCount = 0;
        isCapturing = true;

        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            sendResponse({ success: false, error: 'No active tab found' });
            return;
        }

        // Get a media stream ID for the tab
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

        // Create the offscreen document
        await ensureOffscreenDocument();

        // Tell the offscreen document to start recording
        await chrome.runtime.sendMessage({
            type: 'OFFSCREEN_START_RECORDING',
            streamId: streamId,
        });

        console.log('[Background] Audio capture started for tab:', tab.id);
        sendResponse({ success: true });
    } catch (err) {
        console.error('[Background] Failed to start capture:', err);
        isCapturing = false;
        sendResponse({ success: false, error: err.message });
    }
}

// ── 3. Handle Audio Chunk ────────────────────────────────────
async function handleAudioChunk(base64Data, mimeType) {
    if (!isCapturing) return;

    chunkCount++;
    console.log(`[Background] Processing audio chunk #${chunkCount}`);

    // Notify popup of chunk count
    try {
        chrome.runtime.sendMessage({ type: 'CHUNK_UPDATE', count: chunkCount });
    } catch (e) {
        // Popup may be closed, ignore
    }

    // Send to backend for transcription
    try {
        const response = await fetch(`${API_BASE}/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_data: base64Data,
                mime_type: mimeType,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            if (data.text && data.text.trim().length > 0) {
                transcriptions.push(data.text.trim());
                console.log(`[Background] Transcription #${chunkCount}:`, data.text.trim().substring(0, 80) + '...');
            }
        } else {
            console.error('[Background] Transcription failed:', response.status);
        }
    } catch (err) {
        console.error('[Background] Transcription network error:', err.message);
    }
}

// ── 4. Stop & Summarize ──────────────────────────────────────
async function handleStopAndSummarize(email, sendResponse) {
    try {
        isCapturing = false;

        // Tell offscreen document to stop recording
        try {
            await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP_RECORDING' });
        } catch (e) {
            // Offscreen doc may not exist
        }

        // Wait a moment for any final chunk to be processed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (transcriptions.length === 0) {
            sendResponse({
                success: false,
                error: 'No audio was transcribed. Make sure a video is playing with audible audio.',
            });
            return;
        }

        // Call backend to summarize + email
        const response = await fetch(`${API_BASE}/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transcriptions: transcriptions,
                email: email,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            sendResponse({ success: false, error: `Summarization failed: ${errorBody}` });
            return;
        }

        const data = await response.json();
        sendResponse({
            success: true,
            summary: data.summary,
            emailSent: data.email_sent,
        });

        // Clean up offscreen document
        try {
            await chrome.offscreen.closeDocument();
        } catch (e) {
            // Already closed
        }
    } catch (err) {
        console.error('[Background] Summarize error:', err);
        sendResponse({ success: false, error: err.message });
    }
}

// ── Offscreen Document Management ────────────────────────────
async function ensureOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Recording tab audio for translation and summarization.',
    });
}

console.log('[Translation Agent] Background service worker loaded.');
