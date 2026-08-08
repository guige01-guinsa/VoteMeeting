"use strict";

const pdfFiles = document.querySelector("#pdfFiles");
const fileCount = document.querySelector("#fileCount");
const fileSummary = document.querySelector("#fileSummary");
const analyzeButton = document.querySelector("#analyzeButton");
const saveButton = document.querySelector("#saveButton");
const progressBar = document.querySelector("#progressBar");
const statusText = document.querySelector("#statusText");
const statFiles = document.querySelector("#statFiles");

pdfFiles.addEventListener("change", () => {
  const files = Array.from(pdfFiles.files || []);
  const pdfOnly = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  fileCount.textContent = `${pdfOnly.length}개 선택`;
  statFiles.textContent = String(pdfOnly.length);
  analyzeButton.disabled = pdfOnly.length === 0;
  saveButton.disabled = true;
  progressBar.style.width = "0%";

  if (pdfOnly.length === 0) {
    fileSummary.textContent = "선택된 PDF 파일이 없습니다.";
    statusText.textContent = "PDF를 선택하면 분석을 시작할 수 있습니다.";
    return;
  }

  const previewNames = pdfOnly.slice(0, 5).map((file) => file.name);
  const remaining = pdfOnly.length - previewNames.length;
  fileSummary.textContent = remaining > 0
    ? `${previewNames.join(", ")} 외 ${remaining}개`
    : previewNames.join(", ");
  statusText.textContent = "파일 선택이 완료되었습니다. 다음 단계에서 PDF 분석 기능을 연결합니다.";
});

analyzeButton.addEventListener("click", () => {
  statusText.textContent = "Commit 003부터 실제 PDF 분석 기능을 연결합니다. 현재는 기본 화면 동작 확인 단계입니다.";
});

saveButton.addEventListener("click", () => {
  statusText.textContent = "분석 결과가 준비된 뒤 CSV 저장 기능이 활성화됩니다.";
});
