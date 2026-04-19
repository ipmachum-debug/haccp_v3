// Empty stub for html2canvas — jspdf references it via dynamic import inside
// its optional .html() code path. We never call jsPDF().html() in this app,
// so html2canvas is never needed at runtime. This stub lets Rollup resolve the
// dynamic import without pulling in the 100KB+ html2canvas package.
export default function html2canvasStub(): never {
  throw new Error(
    "html2canvas is not available in this build. Install html2canvas if you need jsPDF().html()."
  );
}
