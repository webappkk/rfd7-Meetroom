// ==================== CONFIG (GitHub Pages) ====================
// ใส่ URL ของ Apps Script Web App ที่ deploy แล้ว (ลงท้ายด้วย /exec)
var SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzpSkv2IhclH2bRKJTxqHdbPgRuX4id0ht0ZB1eusgieZskHmM8LMRSbhbHkLN9qpk1pQ/exec';

// อ่านโหมดจาก query string เช่น ?mode=login หรือ ?mode=public
var SERVER_MODE = new URLSearchParams(window.location.search).get('mode') || 'default';
