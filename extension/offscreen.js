/**
 * offscreen.js — Offscreen document for audio recording.
 *
 * Chrome MV3 does not allow MediaRecorder in service workers,
 * so we use an offscreen document to capture tab audio.
 *
 * Strategy: Stop-and-restart the MediaRecorder every CHUNK_INTERVAL
 * so each chunk is an independent, valid audio file with its own header.
 * This is required because Whisper needs complete audio files, not
 * partial WebM segments.
 */

let mediaRecorder = null;
let audioStream = null;
let audioContext = null;
let chunkTimer = null;
let recordedData = [];
let mimeType = '';

const CHUNK_INTERVAL_MS = 30000; // 30-second chunks

// ── Listen for messages from background.js ───────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OFFSCREEN_START_RECORDING') {
        startRecording(message.streamId);
        sendResponse({ success: true });
    } else if (message.type === 'OFFSCREEN_STOP_RECORDING') {
        stopRecording();
        sendResponse({ success: true });
    }
    return false;
});

// ── Start recording from the tab's audio stream ──────────────
async function startRecording(streamId) {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId,
                },
            },
        });

        // ── Play audio back so the user can still hear it ──────────
        // tabCapture redirects audio to the stream, muting the tab.
        // We pipe it back through an AudioContext to keep it audible.
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(audioStream);
        source.connect(audioContext.destination);

        mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        console.log('[Offscreen] Stream obtained, starting recorder.');
        startNewRecorderSegment();

        // Set up interval to stop-restart for next chunk
        chunkTimer = setInterval(() => {
            finishCurrentSegment();
            startNewRecorderSegment();
        }, CHUNK_INTERVAL_MS);

    } catch (err) {
        console.error('[Offscreen] Failed to start recording:', err);
        chrome.runtime.sendMessage({
            type: 'CAPTURE_ERROR',
            error: err.message,
        });
    }
}

// ── Start a new MediaRecorder segment ────────────────────────
function startNewRecorderSegment() {
    if (!audioStream || !audioStream.active) {
        console.warn('[Offscreen] Stream not active, cannot start segment.');
        return;
    }

    recordedData = [];

    mediaRecorder = new MediaRecorder(audioStream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            recordedData.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        // Combine all data for this segment into one blob
        if (recordedData.length > 0) {
            const blob = new Blob(recordedData, { type: mimeType });
            sendChunkToBackground(blob);
        }
        recordedData = [];
    };

    mediaRecorder.start();
    console.log('[Offscreen] New recording segment started.');
}

// ── Finish the current recording segment ─────────────────────
function finishCurrentSegment() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop(); // triggers onstop → sendChunkToBackground
    }
}

// ── Convert blob to base64 and send to background ────────────
function sendChunkToBackground(blob) {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Data = reader.result.split(',')[1]; // strip "data:..." prefix
        chrome.runtime.sendMessage({
            type: 'AUDIO_CHUNK',
            data: base64Data,
            mimeType: mimeType,
        });
    };
    reader.readAsDataURL(blob);
}

// ── Stop recording completely ────────────────────────────────
function stopRecording() {
    // Clear the chunk interval
    if (chunkTimer) {
        clearInterval(chunkTimer);
        chunkTimer = null;
    }

    // Stop and send the final segment
    finishCurrentSegment();

    // Close audio context
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    // Release the stream
    if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
        audioStream = null;
    }

    console.log('[Offscreen] Recording fully stopped.');
}
