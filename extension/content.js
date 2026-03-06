/**
 * content.js — Main content script for the AI Translation Agent.
 *
 * Scans visible page elements, detects non-English text, requests
 * translations from the background service worker, and inserts
 * translated text inline below the original element.
 */

(() => {
    'use strict';

    // ── Configuration ──────────────────────────────────────────────
    const MIN_TEXT_LENGTH = 100;   // Ignore text shorter than this
    const MAX_TEXT_LENGTH = 5000;  // Truncate text longer than this
    const DEBOUNCE_DELAY = 800;   // ms — debounce for MutationObserver
    const TARGET_SELECTORS = 'p, span, div, li, h1, h2, h3, h4, h5, h6, td, blockquote, figcaption';

    // ── State ──────────────────────────────────────────────────────
    const processedElements = new WeakSet();   // Elements we've already handled
    const translatedHashes = new Set();        // Hashes of text already translated
    let isTranslating = false;            // One-at-a-time lock
    const translationQueue = [];               // Queue of elements waiting

    // ── Core: scan the page for translatable elements ──────────────
    function scanPage() {
        const elements = document.querySelectorAll(TARGET_SELECTORS);

        for (const el of elements) {
            // Skip already-processed elements
            if (processedElements.has(el)) continue;

            // Skip our own translation boxes
            if (el.classList.contains('translation-box')) continue;

            // Get the direct text content (avoid pulling text from nested children)
            const text = getDirectText(el).trim();

            // Skip short text
            if (text.length < MIN_TEXT_LENGTH) continue;

            // Skip English text
            if (isLikelyEnglish(text)) continue;

            // Skip duplicate text
            const hash = hashText(text);
            if (translatedHashes.has(hash)) {
                processedElements.add(el);
                continue;
            }

            // Mark as processed and enqueue
            processedElements.add(el);
            translatedHashes.add(hash);
            const truncatedText = text.length > MAX_TEXT_LENGTH ? text.substring(0, MAX_TEXT_LENGTH) : text;
            translationQueue.push({ element: el, text: truncatedText, hash });
        }

        // Kick off the queue processor
        processQueue();
    }

    // ── Queue processor: one translation at a time ─────────────────
    async function processQueue() {
        if (isTranslating || translationQueue.length === 0) return;

        isTranslating = true;
        const { element, text } = translationQueue.shift();

        // Show a loading placeholder
        const box = createTranslationBox('Translating…', true);
        insertAfter(element, box);

        try {
            const result = await requestTranslation(text);
            if (result && result.success && result.translation && result.translation.length > 0) {
                box.textContent = '';                       // clear loading text
                box.classList.remove('translation-box--loading');

                // Re-add the ::before pseudo-element by keeping the class
                const translatedText = document.createElement('span');
                translatedText.textContent = result.translation;
                box.appendChild(translatedText);
            } else {
                // Remove the box if translation failed
                box.remove();
                console.warn('[Translation Agent] Translation failed for element:', result?.error);
            }
        } catch (err) {
            box.remove();
            console.error('[Translation Agent] Error:', err);
        }

        isTranslating = false;
        // Process next item in queue
        processQueue();
    }

    // ── Send translation request to background.js ─────────────────
    function requestTranslation(text) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: 'TRANSLATE', text },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    }

    // ── DOM helpers ────────────────────────────────────────────────

    /**
     * Get the direct text of an element, excluding text from child elements.
     * This prevents translating a parent when we'd also translate the children.
     */
    function getDirectText(element) {
        let text = '';
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            }
        }
        // If no direct text, fall back to innerText (for leaf nodes)
        if (text.trim().length === 0) {
            text = element.innerText || '';
        }
        return text;
    }

    /**
     * Create a translation box element.
     */
    function createTranslationBox(content, isLoading = false) {
        const box = document.createElement('div');
        box.className = 'translation-box' + (isLoading ? ' translation-box--loading' : '');
        box.textContent = content;
        return box;
    }

    /**
     * Insert a node directly after a reference node.
     */
    function insertAfter(referenceNode, newNode) {
        if (referenceNode.nextSibling) {
            referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
        } else {
            referenceNode.parentNode.appendChild(newNode);
        }
    }

    // ── MutationObserver: watch for dynamically loaded content ─────
    const debouncedScan = debounce(scanPage, DEBOUNCE_DELAY);

    const observer = new MutationObserver((mutations) => {
        // Only re-scan if actual content was added
        const hasNewContent = mutations.some(
            (m) => m.addedNodes.length > 0 || m.type === 'characterData'
        );
        if (hasNewContent) {
            debouncedScan();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    // ── Initial scan ───────────────────────────────────────────────
    scanPage();

    console.log('[Translation Agent] Content script loaded and scanning.');
})();
