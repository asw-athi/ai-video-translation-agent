/**
 * utils.js — Shared utility functions for the translation extension.
 */

/**
 * Debounce: delays invoking `fn` until after `delay` ms have elapsed
 * since the last invocation.
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Heuristic language detection.
 * Returns true if the text appears to be English.
 *
 * Strategy:
 * 1. Non-Latin scripts (Cyrillic, CJK, Arabic, Devanagari, etc.) → not English
 * 2. Latin-script languages (French, Spanish, German, etc.) → detected via
 *    accented/diacritical characters and common foreign-language words
 * 3. If neither signal is found, assume English
 */
function isLikelyEnglish(text) {
  if (!text || text.trim().length === 0) return true;

  const cleaned = text.replace(/[\s\d]/g, '');
  if (cleaned.length === 0) return true;

  // ── 1. Check for non-Latin scripts ────────────────────────────
  let nonLatinCount = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (
      code > 0x024F &&   // beyond Latin Extended-B
      code !== 0x2019 && // right single quote (used in English)
      code !== 0x2018 && // left single quote
      code !== 0x201C && // left double quote
      code !== 0x201D    // right double quote
    ) {
      nonLatinCount++;
    }
  }
  // If more than 10% non-Latin characters → definitely not English
  if (nonLatinCount / cleaned.length > 0.1) return false;

  // ── 2. Check for accented / diacritical characters ────────────
  // These are strong signals of French, Spanish, German, Portuguese, etc.
  const accentedPattern = /[àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿœšžÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞŸŒŠŽ]/g;
  const accentedMatches = cleaned.match(accentedPattern);
  const accentedCount = accentedMatches ? accentedMatches.length : 0;

  // If more than 2% accented characters → likely a foreign Latin-script language
  if (accentedCount / cleaned.length > 0.02) return false;

  // ── 3. Check for common foreign-language words ────────────────
  const lowerText = text.toLowerCase();
  const foreignPatterns = [
    // French
    /\b(les|des|une|est|dans|pour|sur|avec|qui|que|sont|cette|aux|ont|ses|par|pas|mais|nous|vous|leur|très|aussi|peut|tout|tous|comme|entre|après|même|être|faire|plus|sans|fait)\b/,
    // Spanish
    /\b(los|las|una|del|por|con|para|como|pero|más|esta|este|puede|entre|desde|sobre|tiene|hasta|todos|también|otro|sido|hay|después|hacer)\b/,
    // German
    /\b(der|die|das|und|ist|von|den|mit|auf|für|eine|sich|dem|ein|als|auch|nach|wie|über|nur|bei|noch|zur|zum|aus|oder|werden|wird|sind|hat|vor|diese|durch|dass)\b/,
    // Portuguese
    /\b(uma|dos|das|por|com|para|como|mais|sobre|pode|entre|desde|esta|também|outro|foram|depois|fazer|pelo|pela)\b/,
    // Italian
    /\b(della|nella|sono|alla|anche|questo|questa|essere|hanno|stato|stati|perché|fatto|molto|tutti|dopo)\b/,
  ];

  let foreignWordHits = 0;
  for (const pattern of foreignPatterns) {
    const matches = lowerText.match(new RegExp(pattern, 'g'));
    if (matches) foreignWordHits += matches.length;
  }

  // Count total words
  const totalWords = text.split(/\s+/).filter(w => w.length > 0).length;

  // If more than 15% of words are common foreign words → not English
  if (totalWords > 0 && foreignWordHits / totalWords > 0.15) return false;

  return true;
}

/**
 * Simple string hash for use as cache keys.
 * Returns a numeric hash converted to a hex string.
 */
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}
