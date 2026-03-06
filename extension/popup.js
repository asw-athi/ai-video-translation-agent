/**
 * popup.js — Controls the extension popup UI for video audio capture.
 *
 * Communicates with background.js to start/stop audio capture and
 * trigger summarization + email delivery.
 */

(() => {
    'use strict';

    // ── DOM elements ───────────────────────────────────────────────
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const emailInput = document.getElementById('email-input');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const chunkCountEl = document.getElementById('chunk-count');
    const chunksProcessed = document.getElementById('chunks-processed');
    const resultSection = document.getElementById('result-section');
    const summaryText = document.getElementById('summary-text');
    const emailStatus = document.getElementById('email-status');
    const errorSection = document.getElementById('error-section');
    const errorText = document.getElementById('error-text');

    // ── State ──────────────────────────────────────────────────────
    let isRecording = false;

    // Load saved email from storage
    chrome.storage.local.get(['userEmail'], (result) => {
        if (result.userEmail) {
            emailInput.value = result.userEmail;
        }
    });

    // ── Status helpers ─────────────────────────────────────────────
    function setStatus(state, text) {
        statusIndicator.className = `status-indicator status--${state}`;
        statusText.textContent = text;
    }

    function showError(msg) {
        errorSection.style.display = 'block';
        errorText.textContent = msg;
    }

    function hideError() {
        errorSection.style.display = 'none';
    }

    // ── Start Listening ────────────────────────────────────────────
    btnStart.addEventListener('click', async () => {
        hideError();
        resultSection.style.display = 'none';

        const email = emailInput.value.trim();
        if (!email) {
            showError('Please enter an email address.');
            return;
        }

        // Save email for next time
        chrome.storage.local.set({ userEmail: email });

        setStatus('recording', 'Starting audio capture...');
        btnStart.disabled = true;
        btnStop.disabled = false;
        chunkCountEl.style.display = 'block';
        chunksProcessed.textContent = '0';

        // Tell background to start capturing
        chrome.runtime.sendMessage(
            { type: 'START_CAPTURE' },
            (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                    const err = chrome.runtime.lastError?.message || response?.error || 'Failed to start capture';
                    showError(err);
                    setStatus('error', 'Capture failed');
                    btnStart.disabled = false;
                    btnStop.disabled = true;
                    return;
                }
                isRecording = true;
                setStatus('recording', 'Recording audio...');
            }
        );
    });

    // ── Stop & Summarize ──────────────────────────────────────────
    btnStop.addEventListener('click', () => {
        hideError();
        const email = emailInput.value.trim();

        setStatus('processing', 'Stopping & processing...');
        btnStop.disabled = true;
        isRecording = false;

        chrome.runtime.sendMessage(
            { type: 'STOP_AND_SUMMARIZE', email },
            (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                    const err = chrome.runtime.lastError?.message || response?.error || 'Summarization failed';
                    showError(err);
                    setStatus('error', 'Error');
                    btnStart.disabled = false;
                    return;
                }

                // Show result
                setStatus('done', 'Done!');
                resultSection.style.display = 'block';
                summaryText.textContent = response.summary;
                emailStatus.textContent = response.emailSent
                    ? `✅ Summary emailed to ${email}`
                    : '⚠️ Summary generated but email not sent';
                btnStart.disabled = false;
                chunkCountEl.style.display = 'none';
            }
        );
    });

    // ── Listen for chunk count updates from background ─────────────
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'CHUNK_UPDATE') {
            chunksProcessed.textContent = message.count;
        }
        if (message.type === 'CAPTURE_STATUS') {
            setStatus(message.state, message.text);
        }
    });
})();
