(function () {
  'use strict';

  const SHIFT_KEY = 'keepRichShiftsV2';
  const PAYSTUB_KEY = 'keepRichPaystubsV1';
  const VIEW_KEY = 'keepRichPayDateViewV1';
  const LAST_BACKUP_KEY = 'keepRichLastBackupV1';
  const DB_NAME = 'keepRichBackupDb';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'automaticBackupFile';
  let backupHandle = null;

  const $ = selector => document.querySelector(selector);
  const readArray = key => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  function snapshot(reason = 'manual backup') {
    return {
      format: 'keep-rich-tracker-backup',
      version: 1,
      savedAt: new Date().toISOString(),
      reason,
      shifts: readArray(SHIFT_KEY),
      paystubs: readArray(PAYSTUB_KEY),
      preferences: { dashboardPayDate: localStorage.getItem(VIEW_KEY) || 'all' }
    };
  }

  function setStatus(state, detail) {
    const indicator = $('#backup-state');
    const description = $('#backup-detail');
    if (indicator) {
      indicator.textContent = state;
      indicator.dataset.state = state.toLowerCase().replace(/\s+/g, '-');
    }
    if (description) description.textContent = detail;
  }

  function setFileName() {
    const target = $('#backup-file-name');
    if (target) target.textContent = backupHandle?.name || 'No file linked';
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeHandle(handle) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  async function loadHandle() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  }

  async function permissionGranted(handle, request = false) {
    if (!handle?.queryPermission) return false;
    const options = { mode: 'readwrite' };
    if (await handle.queryPermission(options) === 'granted') return true;
    return request && await handle.requestPermission(options) === 'granted';
  }

  async function writeLinkedBackup(reason, requestPermission = false) {
    await ready;
    if (!backupHandle) {
      setStatus('Not linked', 'Choose a backup file once to turn on automatic backups.');
      return false;
    }
    if (!await permissionGranted(backupHandle, requestPermission)) {
      setStatus('Reconnect needed', 'Your backup file is remembered, but the browser needs permission to write to it again.');
      return false;
    }
    try {
      const writable = await backupHandle.createWritable();
      await writable.write(JSON.stringify(snapshot(reason), null, 2));
      await writable.close();
      const now = new Date();
      localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
      $('#backup-last').textContent = now.toLocaleString();
      setStatus('Auto-backup on', `Saved ${reason} to ${backupHandle.name}.`);
      return true;
    } catch (error) {
      console.error(error);
      setStatus('Backup error', 'The browser copy is safe, but the linked file could not be updated. Reconnect it and try again.');
      return false;
    }
  }

  async function chooseBackupFile() {
    if (!window.showSaveFilePicker) {
      setStatus('Manual backups', 'This browser cannot keep a file linked. Use Download copy after changes.');
      return;
    }
    try {
      backupHandle = await window.showSaveFilePicker({
        suggestedName: 'keep-rich-tracker-backup.json',
        types: [{ description: 'Keep Rich tracker backup', accept: { 'application/json': ['.json'] } }]
      });
      await storeHandle(backupHandle);
      setFileName();
      await writeLinkedBackup('backup file connected', true);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(error);
        setStatus('Backup error', 'The backup file could not be connected.');
      }
    }
  }

  function downloadCopy() {
    const blob = new Blob([JSON.stringify(snapshot('downloaded backup'), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `keep-rich-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatus(backupHandle ? 'Auto-backup on' : 'Copy downloaded', 'A fresh portable backup was downloaded.');
  }

  async function restoreFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data?.format !== 'keep-rich-tracker-backup' || !Array.isArray(data.shifts) || !Array.isArray(data.paystubs)) {
        throw new Error('Not a Keep Rich tracker backup.');
      }
      if (!confirm(`Restore ${data.shifts.length} shifts and ${data.paystubs.length} paystubs? This replaces the data currently in this browser.`)) return;
      localStorage.setItem(SHIFT_KEY, JSON.stringify(data.shifts));
      localStorage.setItem(PAYSTUB_KEY, JSON.stringify(data.paystubs));
      if (data.preferences?.dashboardPayDate) localStorage.setItem(VIEW_KEY, data.preferences.dashboardPayDate);
      window.dispatchEvent(new Event('backup:restored'));
      setStatus(backupHandle ? 'Auto-backup on' : 'Restore complete', `Restored from ${file.name}.`);
      await writeLinkedBackup('restored data');
    } catch (error) {
      console.error(error);
      setStatus('Restore failed', error.message || 'That file could not be restored.');
    } finally {
      $('#backup-import').value = '';
    }
  }

  const ready = (async () => {
    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
    if (lastBackup) $('#backup-last').textContent = new Date(lastBackup).toLocaleString();
    if (!('indexedDB' in window)) {
      setStatus('Manual backups', 'This browser cannot remember a linked file. Use Download copy after changes.');
      return;
    }
    try {
      backupHandle = await loadHandle();
      setFileName();
      if (!backupHandle) {
        setStatus('Not linked', 'Choose a backup file once to turn on automatic backups.');
      } else if (await permissionGranted(backupHandle)) {
        setStatus('Auto-backup on', 'Every saved change will update the linked file.');
      } else {
        setStatus('Reconnect needed', 'Select Reconnect backup to allow automatic saving again.');
      }
    } catch (error) {
      console.error(error);
      setStatus('Manual backups', 'The saved file connection could not be opened. Download copies still work.');
    }
  })();

  window.KeepRichBackup = {
    changed: reason => writeLinkedBackup(reason),
    snapshot
  };

  $('#backup-connect').addEventListener('click', async () => {
    await ready;
    if (backupHandle && await permissionGranted(backupHandle, true)) {
      await writeLinkedBackup('backup reconnected');
    } else {
      await chooseBackupFile();
    }
  });
  $('#backup-now').addEventListener('click', async () => {
    await ready;
    if (!backupHandle) {
      await chooseBackupFile();
      return;
    }
    await writeLinkedBackup('manual backup', true);
  });
  $('#backup-download').addEventListener('click', downloadCopy);
  $('#backup-restore').addEventListener('click', () => $('#backup-import').click());
  $('#backup-import').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) restoreFile(file);
  });
})();
