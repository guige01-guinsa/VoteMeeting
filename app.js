const state = {
  pdfFiles: [],
  agendaCount: 3,
  records: [],
  processing: false,
  pageCount: 0
};

const voteFieldNames = ["동", "호", "이름", "연락처", "투표방법", "투표일시"];

const pdfjsReady = typeof window.pdfjsLib !== "undefined";
const tesseractReady = typeof window.Tesseract !== "undefined";

if (pdfjsReady) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js";
}

const sampleRecords = [
  {
    dong: "101",
    ho: "1203",
    name: "홍길동",
    phone: "01012345678",
    voteMethod: "수개표",
    voteDate: "2026-07-28 14:32:15",
    agenda1: "찬성",
    agenda2: "반대",
    agenda3: "찬성",
    duplicate: "정상"
  },
  {
    dong: "101",
    ho: "1205",
    name: "김철수",
    phone: "01098765432",
    voteMethod: "앱",
    voteDate: "2026-07-28 14:35:01",
    agenda1: "찬성",
    agenda2: "찬성",
    agenda3: "반대",
    duplicate: "정상"
  },
  {
    dong: "102",
    ho: "1502",
    name: "이영희",
    phone: "01055554444",
    voteMethod: "수개표",
    voteDate: "2026-07-28 14:40:22",
    agenda1: "반대",
    agenda2: "반대",
    agenda3: "찬성",
    duplicate: "중복"
  }
];

const elements = {
  pdfInput: document.getElementById("pdfInput"),
  loadSampleBtn: document.getElementById("loadSampleBtn"),
  clearBtn: document.getElementById("clearBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  agendaCountInput: document.getElementById("agendaCountInput"),
  recordForm: document.getElementById("recordForm"),
  statusText: document.getElementById("statusText"),
  statusDetail: document.getElementById("statusDetail"),
  pdfCount: document.getElementById("pdfCount"),
  recordCount: document.getElementById("recordCount"),
  duplicateCount: document.getElementById("duplicateCount"),
  fileList: document.getElementById("fileList"),
  pipelineStep: document.getElementById("pipelineStep"),
  pageCount: document.getElementById("pageCount"),
  ocrMode: document.getElementById("ocrMode"),
  pipelineLog: document.getElementById("pipelineLog"),
  tableHead: document.getElementById("tableHead"),
  tableBody: document.getElementById("tableBody")
};

function updateStatus(title, detail) {
  elements.statusText.textContent = title;
  elements.statusDetail.textContent = detail;
}

function updatePipeline(step, detail) {
  elements.pipelineStep.textContent = step;
  elements.pipelineLog.textContent = detail;
}

function createInternalId(record) {
  const dateToken = String(record.voteDate || "").replace(/[^0-9]/g, "");
  return `${record.dong || ""}${record.ho || ""}-${dateToken || "pending"}`;
}

function formatDateTimeInputValue(value) {
  if (!value) {
    return "";
  }

  const normalized = value.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function buildAgendaKeys(count) {
  return Array.from({ length: count }, (_, index) => `agenda${index + 1}`);
}

function escapeCsvValue(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseVoteDateTime(value) {
  const normalized = String(value ?? "").trim().replace("T", " ");
  if (!normalized) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }

  return normalized;
}

function parsePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function markDuplicate(record) {
  const sameUnit = state.records.filter((item) => item.dong === record.dong && item.ho === record.ho);
  const sameIdentity = state.records.filter((item) => item.dong === record.dong && item.ho === record.ho && item.name === record.name);

  if (sameIdentity.length > 0) {
    return "중복";
  }

  if (!record.dong || !record.ho || !record.name) {
    return "확인필요";
  }

  if (sameUnit.length > 0) {
    return "확인필요";
  }

  return "정상";
}

function inferVoteMethod({ source, text }) {
  if (source === "manual") {
    return "수개표";
  }

  if (/앱|mobile|online|전자/i.test(text)) {
    return "앱";
  }

  return "수개표";
}

function inferAgendaValue(text) {
  if (/찬성|yes|agree|동의/i.test(text)) {
    return "찬성";
  }

  if (/반대|no|disagree|부동의/i.test(text)) {
    return "반대";
  }

  if (/기권|abstain/i.test(text)) {
    return "기권";
  }

  return "기권";
}

function extractStructuredFields(text) {
  const normalized = String(text ?? "").replace(/\r/g, "\n");
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const valueByLabel = new Map();

  lines.forEach((line) => {
    const matched = line.match(/^(동|호|이름|연락처|투표방법|투표일시|1안|2안|3안|4안|5안)\s*[:\-]?\s*(.+)$/);
    if (matched) {
      valueByLabel.set(matched[1], matched[2].trim());
    }
  });

  const combined = normalized.replace(/\s+/g, " ");
  return {
    dong: valueByLabel.get("동") || (combined.match(/동\s*(\d{2,4})/)?.[1] ?? ""),
    ho: valueByLabel.get("호") || (combined.match(/호\s*(\d{2,4})/)?.[1] ?? ""),
    name: valueByLabel.get("이름") || (combined.match(/이름\s*([가-힣]{2,4})/)?.[1] ?? ""),
    phone: parsePhone(valueByLabel.get("연락처") || (combined.match(/(01[0-9]-?\d{3,4}-?\d{4})/)?.[1] ?? "")),
    voteMethod: valueByLabel.get("투표방법") || inferVoteMethod({ source: "ocr", text: normalized }),
    voteDate: parseVoteDateTime(valueByLabel.get("투표일시") || (combined.match(/(20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/)?.[1] ?? "")),
    agendas: buildAgendaKeys(state.agendaCount).map((key, index) => {
      const label = `${index + 1}안`;
      return valueByLabel.get(label) || inferAgendaValue(valueByLabel.get(label) || normalized);
    })
  };
}

function createRecordFromFields(fields, source = "ocr") {
  const agendaKeys = buildAgendaKeys(state.agendaCount);
  const record = {
    dong: fields.dong,
    ho: fields.ho,
    name: fields.name,
    phone: fields.phone,
    voteMethod: inferVoteMethod({ source, text: `${fields.dong} ${fields.ho} ${fields.name} ${fields.phone}` }),
    voteDate: fields.voteDate || new Date().toISOString().slice(0, 19).replace("T", " "),
    duplicate: "정상"
  };

  agendaKeys.forEach((key, index) => {
    record[key] = fields.agendas?.[index] || "기권";
  });

  record.duplicate = markDuplicate(record);
  record.id = createInternalId(record);
  return record;
}

function aggregatePageText(pageTexts) {
  return pageTexts.join("\n");
}

async function readPdfPageText(pdfPage) {
  const textContent = await pdfPage.getTextContent();
  return textContent.items.map((item) => item.str).join(" ");
}

async function renderPageToCanvas(pdfPage) {
  const viewport = pdfPage.getViewport({ scale: 1.6 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await pdfPage.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function ocrCanvas(canvas) {
  if (!tesseractReady) {
    return "";
  }

  const result = await window.Tesseract.recognize(canvas, "kor+eng", {
    logger: (message) => {
      if (message.status) {
        updatePipeline(`OCR ${message.status}`, message.progress ? `진행률 ${(message.progress * 100).toFixed(0)}%` : "처리 중입니다.");
      }
    }
  });

  return result.data.text || "";
}

async function extractPdfText(file) {
  if (!pdfjsReady) {
    throw new Error("PDF.js를 사용할 수 없습니다.");
  }

  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = await readPdfPageText(page);
    pageTexts.push(text);

    if (!text.trim() && tesseractReady) {
      const canvas = await renderPageToCanvas(page);
      const ocrText = await ocrCanvas(canvas);
      pageTexts[pageTexts.length - 1] = ocrText;
    }

    state.pageCount += 1;
    elements.pageCount.textContent = String(state.pageCount);
  }

  return aggregatePageText(pageTexts);
}

async function importPdfFiles(files) {
  state.processing = true;
  state.pageCount = 0;
  elements.pageCount.textContent = "0";
  updatePipeline("분석 시작", `${files.length}개 PDF를 순차 처리합니다.`);
  updateStatus("PDF 분석 중", "페이지 텍스트 추출과 OCR 보완을 진행합니다.");

  const importedRecords = [];

  for (const file of files) {
    updatePipeline("PDF 열기", `${file.name}에서 텍스트를 추출하는 중입니다.`);

    let extractedText = "";
    try {
      extractedText = await extractPdfText(file);
    } catch (error) {
      updatePipeline("PDF 실패", `${file.name}: ${error.message}`);
      importedRecords.push(
        sanitizeRecord({
          dong: "",
          ho: "",
          name: file.name,
          phone: "",
          voteMethod: "수개표",
          voteDate: new Date().toISOString().slice(0, 19).replace("T", " "),
          duplicate: "확인필요"
        })
      );
      continue;
    }

    const structured = extractStructuredFields(extractedText);
    const nextRecord = createRecordFromFields(structured, extractedText.includes("앱") ? "app" : "ocr");
    importedRecords.push(nextRecord);
    updatePipeline("PDF 완료", `${file.name} 처리 완료`);
  }

  state.records = [...state.records, ...importedRecords.map((record) => ({ ...record, duplicate: markDuplicate(record) }))];
  state.processing = false;

  refreshView();
  updateStatus("PDF 분석 완료", `${importedRecords.length}건을 내부 데이터 구조에 연결했습니다.`);
  updatePipeline("대기", "다음 PDF를 선택하면 다시 처리합니다.");
}

function normalizeRecord(record) {
  const agendaKeys = buildAgendaKeys(state.agendaCount);
  const normalized = {
    dong: String(record.dong ?? "").trim(),
    ho: String(record.ho ?? "").trim(),
    name: String(record.name ?? "").trim(),
    phone: String(record.phone ?? "").trim(),
    voteMethod: String(record.voteMethod ?? "수개표").trim(),
    voteDate: String(record.voteDate ?? "").trim(),
    duplicate: String(record.duplicate ?? "정상").trim()
  };

  agendaKeys.forEach((key, index) => {
    const sourceKey = `agenda${index + 1}`;
    normalized[key] = String(record[sourceKey] ?? "기권").trim();
  });

  normalized.id = createInternalId(normalized);
  return normalized;
}

function sanitizeRecord(record) {
  const normalized = normalizeRecord({
    ...record,
    voteDate: parseVoteDateTime(record.voteDate),
    phone: parsePhone(record.phone)
  });

  normalized.duplicate = record.duplicate || markDuplicate(normalized);
  normalized.id = createInternalId(normalized);
  return normalized;
}

function renderTable() {
  const headers = ["동", "호", "이름", "연락처", "투표방법", "투표일시"]
    .concat(buildAgendaKeys(state.agendaCount).map((_, index) => `${index + 1}안`))
    .concat(["중복확인"]);

  elements.tableHead.innerHTML = `<tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>`;

  const rows = state.records.map((record) => {
    const agendaCells = buildAgendaKeys(state.agendaCount)
      .map((key) => `<td>${record[key] ?? "-"}</td>`)
      .join("");

    const duplicateClass = record.duplicate === "중복" ? "dup" : record.duplicate === "확인필요" ? "needs" : "ok";

    return `
      <tr>
        <td>${record.dong}</td>
        <td>${record.ho}</td>
        <td>${record.name}</td>
        <td>${record.phone}</td>
        <td>${record.voteMethod}</td>
        <td>${record.voteDate}</td>
        ${agendaCells}
        <td><span class="status-chip ${duplicateClass}">${record.duplicate}</span></td>
      </tr>
    `;
  });

  elements.tableBody.innerHTML = rows.join("") || `
    <tr>
      <td colspan="${headers.length}">표시할 데이터가 없습니다.</td>
    </tr>
  `;

  const duplicateCount = state.records.filter((record) => record.duplicate === "중복").length;
  elements.recordCount.textContent = String(state.records.length);
  elements.duplicateCount.textContent = String(duplicateCount);
}

function renderSummary() {
  elements.pdfCount.textContent = String(state.pdfFiles.length);
  elements.fileList.textContent = state.pdfFiles.length
    ? state.pdfFiles.map((file) => file.name).join(", ")
    : "선택된 파일이 없습니다.";
}

function refreshView() {
  renderSummary();
  renderTable();
}

function loadSampleData() {
  state.records = sampleRecords.map((record) => sanitizeRecord(record));
  updateStatus("샘플 준비 완료", "샘플 개표 데이터 3건을 불러왔습니다.");
  updatePipeline("샘플 로드", "샘플 레코드로 화면을 채웠습니다.");
  refreshView();
}

function resetAll() {
  state.pdfFiles = [];
  state.records = [];
  state.pageCount = 0;
  elements.pdfInput.value = "";
  elements.recordForm.reset();
  elements.agendaCountInput.value = "3";
  state.agendaCount = 3;
  updateStatus("초기화 완료", "선택된 PDF와 개표 데이터가 초기화되었습니다.");
  updatePipeline("대기", "PDF 선택을 기다리는 중입니다.");
  refreshView();
}

function exportCsv() {
  const header = ["동", "호", "이름", "연락처", "투표방법", "투표일시"]
    .concat(buildAgendaKeys(state.agendaCount).map((_, index) => `${index + 1}안`))
    .concat(["중복확인"]);

  const lines = [header.join(",")];

  state.records.forEach((record) => {
    const row = [
      record.dong,
      record.ho,
      record.name,
      record.phone,
      record.voteMethod,
      record.voteDate,
      ...buildAgendaKeys(state.agendaCount).map((key) => record[key] ?? ""),
      record.duplicate
    ];

    lines.push(row.map(escapeCsvValue).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "vote-meeting-export.csv";
  link.click();
  URL.revokeObjectURL(link.href);

  updateStatus("CSV 저장 완료", `${state.records.length}건의 데이터를 CSV로 내보냈습니다.`);
}

elements.pdfInput.addEventListener("change", (event) => {
  state.pdfFiles = Array.from(event.target.files ?? []).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  if (state.pdfFiles.length === 0) {
    updateStatus("PDF 선택 필요", "PDF 파일만 선택할 수 있습니다.");
    updatePipeline("대기", "유효한 PDF 파일이 선택되지 않았습니다.");
    refreshView();
    return;
  }

  if (!pdfjsReady) {
    updateStatus("PDF.js 필요", "PDF.js가 로드되지 않아 분석을 시작할 수 없습니다.");
    updatePipeline("오류", "PDF.js 스크립트가 필요합니다.");
    refreshView();
    return;
  }

  if (!tesseractReady) {
    elements.ocrMode.textContent = "비활성";
  } else {
    updateStatus("PDF 선택 완료", `${state.pdfFiles.length}개의 PDF가 선택되었습니다. 이후 OCR 파이프라인을 연결할 수 있습니다.`);
    elements.ocrMode.textContent = "활성";
  }

  importPdfFiles(state.pdfFiles).catch((error) => {
    state.processing = false;
    updateStatus("분석 실패", error.message);
    updatePipeline("오류", error.message);
  });
});

elements.loadSampleBtn.addEventListener("click", loadSampleData);
elements.clearBtn.addEventListener("click", resetAll);
elements.exportCsvBtn.addEventListener("click", exportCsv);

elements.agendaCountInput.addEventListener("change", (event) => {
  const nextCount = Math.max(3, Math.min(12, Number(event.target.value) || 3));
  state.agendaCount = nextCount;
  elements.agendaCountInput.value = String(nextCount);
  state.records = state.records.map((record) => sanitizeRecord(record));
  updateStatus("안건 수 변경", `${nextCount}개의 안건 컬럼으로 표와 CSV 구성이 갱신되었습니다.`);
  refreshView();
});

elements.recordForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(elements.recordForm);
  const data = Object.fromEntries(formData.entries());
  const record = sanitizeRecord({
    ...data,
    voteDate: parseVoteDateTime(data.voteDate),
    duplicate: markDuplicate({
      dong: String(data.dong ?? "").trim(),
      ho: String(data.ho ?? "").trim(),
      name: String(data.name ?? "").trim()
    })
  });

  state.records = [...state.records, record];
  elements.recordForm.reset();
  elements.recordForm.elements.voteMethod.value = "수개표";
  elements.recordForm.elements.agenda1.value = "찬성";
  elements.recordForm.elements.agenda2.value = "찬성";
  elements.recordForm.elements.agenda3.value = "찬성";
  elements.recordForm.elements.duplicate.value = "정상";

  updateStatus("레코드 추가됨", `${record.dong}동 ${record.ho}호 데이터가 추가되었습니다.`);
  refreshView();
});

loadSampleData();