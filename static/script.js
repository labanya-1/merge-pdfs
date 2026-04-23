// Tabs ---------------------------------------------------------------
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById(t.dataset.tab).classList.add("active");
  });
});

// Generic dropzone wiring -------------------------------------------
function wireDropzone({ dropId, inputId, listId, multiple, onChange }) {
  const drop = document.querySelector(`label[for="${inputId}"]`);
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  let files = [];

  function render() {
    list.innerHTML = "";
    files.forEach((f, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(f.name)} <small style="color:var(--muted)">(${formatSize(f.size)})</small></span>`;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "remove";
      rm.textContent = "×";
      rm.setAttribute("aria-label", "Remove");
      rm.onclick = () => {
        files.splice(i, 1);
        render();
        onChange(files);
      };
      li.appendChild(rm);
      list.appendChild(li);
    });
    onChange(files);
  }

  function addFiles(newFiles) {
    const pdfs = [...newFiles].filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (multiple) files = files.concat(pdfs);
    else files = pdfs.slice(0, 1);
    render();
  }

  input.addEventListener("change", (e) => addFiles(e.target.files));

  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
    })
  );
  drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  return {
    getFiles: () => files,
    reset: () => { files = []; input.value = ""; render(); },
  };
}

function formatSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// Merge --------------------------------------------------------------
const mergeBtn = document.querySelector("#mergeForm button.primary");
const mergeStatus = document.getElementById("mergeStatus");
const mergeBox = wireDropzone({
  dropId: "mergeDrop",
  inputId: "mergeInput",
  listId: "mergeList",
  multiple: true,
  onChange: (files) => { mergeBtn.disabled = files.length < 2; },
});

document.getElementById("mergeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const files = mergeBox.getFiles();
  if (files.length < 2) return;
  await submit({
    url: "/merge",
    files,
    fieldName: "files",
    multiple: true,
    defaultName: "merged.pdf",
    button: mergeBtn,
    statusEl: mergeStatus,
    onDone: () => mergeBox.reset(),
  });
});

// Convert ------------------------------------------------------------
const convertBtn = document.querySelector("#convertForm button.primary");
const convertStatus = document.getElementById("convertStatus");
const convertBox = wireDropzone({
  dropId: "convertDrop",
  inputId: "convertInput",
  listId: "convertList",
  multiple: false,
  onChange: (files) => { convertBtn.disabled = files.length < 1; },
});

document.getElementById("convertForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const files = convertBox.getFiles();
  if (files.length < 1) return;
  await submit({
    url: "/convert",
    files,
    fieldName: "file",
    multiple: false,
    defaultName: "converted.docx",
    button: convertBtn,
    statusEl: convertStatus,
    onDone: () => convertBox.reset(),
  });
});

// Shared submit helper ----------------------------------------------
async function submit({ url, files, fieldName, multiple, defaultName, button, statusEl, onDone }) {
  const fd = new FormData();
  if (multiple) files.forEach((f) => fd.append(fieldName, f));
  else fd.append(fieldName, files[0]);

  button.disabled = true;
  statusEl.className = "status";
  statusEl.innerHTML = `<span class="spinner"></span>Processing…`;

  try {
    const res = await fetch(url, { method: "POST", body: fd });
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const name = filenameFromResponse(res) || defaultName;
    triggerDownload(blob, name);
    statusEl.className = "status ok";
    statusEl.textContent = `Done — downloaded ${name}`;
    onDone();
  } catch (err) {
    statusEl.className = "status err";
    statusEl.textContent = err.message || "Something went wrong.";
  } finally {
    button.disabled = false;
  }
}

function filenameFromResponse(res) {
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : null;
}
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
