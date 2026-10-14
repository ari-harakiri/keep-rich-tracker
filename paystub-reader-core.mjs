import * as pdfjsLib from './pdf.min.mjs?v=31';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs?v=31', import.meta.url).href;

const PDF_READ_TIMEOUT_MS = 30000;

function readFileBuffer(file) {
  if (typeof file?.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(reader.error || new Error('The selected PDF could not be read.')), { once: true });
    reader.addEventListener('abort', () => reject(new Error('PDF reading was cancelled.')), { once: true });
    reader.readAsArrayBuffer(file);
  });
}

export async function extractTextFromBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) {
    throw new Error('The selected PDF is empty or unavailable.');
  }
  if (buffer.byteLength === 0) throw new Error('The selected PDF is empty or unavailable.');

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
    stopAtErrors: false,
    useWorkerFetch: false,
    useWasm: false
  });
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('The PDF reader timed out after 30 seconds.')), PDF_READ_TIMEOUT_MS);
  });
  const extraction = (async () => {
    const pdfDocument = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
      page.cleanup();
    }
    return pages.join('\n');
  })();
  try {
    return await Promise.race([extraction, timeout]);
  } finally {
    clearTimeout(timeoutId);
    await loadingTask.destroy().catch(() => {});
  }
}

export async function extractText(file) {
  return extractTextFromBuffer(await readFileBuffer(file));
}
