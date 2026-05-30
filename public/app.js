const presetSelect = document.querySelector("#preset");
const repoPath = document.querySelector("#repoPath");
const command = document.querySelector("#command");
const note = document.querySelector("#note");
const status = document.querySelector("#status");
const output = document.querySelector("#output");
const pullButton = document.querySelector("#pullButton");
const runButton = document.querySelector("#runButton");
const clearButton = document.querySelector("#clearButton");
const pullTime = document.querySelector("#pullTime");
const runTime = document.querySelector("#runTime");
const exitCode = document.querySelector("#exitCode");

let presets = [];
let statusPoll = null;

const formatDuration = (ms) => {
  if (!Number.isFinite(ms)) return "-";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds - minutes * 60).toFixed(1)}s`;
};

const setBusy = (busy, label = "Idle") => {
  status.textContent = label;
  pullButton.disabled = busy;
  runButton.disabled = busy;
};

const appendOutput = (text) => {
  output.textContent = text || "(no output)";
  output.scrollTop = output.scrollHeight;
};

const stopPolling = () => {
  if (!statusPoll) return;
  clearInterval(statusPoll);
  statusPoll = null;
};

const updateLiveStatus = async () => {
  const response = await fetch("/api/run-status");
  const payload = await response.json();

  if (payload.active) {
    status.textContent = payload.mode === "pull" ? "Pulling" : "Running";
    if (payload.mode === "pull") {
      pullTime.textContent = formatDuration(payload.elapsedMs);
    } else {
      runTime.textContent = formatDuration(payload.elapsedMs);
    }
    if (payload.output) {
      appendOutput(payload.output);
    }
    return;
  }

  stopPolling();
};

const startPolling = () => {
  stopPolling();
  statusPoll = setInterval(() => {
    updateLiveStatus().catch(() => {
      stopPolling();
    });
  }, 1000);
};

const selectedPayload = () => ({
  presetId: presetSelect.value,
  repoPath: repoPath.value.trim(),
  command: command.value.trim(),
});

const requestJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.output || "Command failed");
  }
  return payload;
};

const syncPreset = () => {
  const preset = presets.find((item) => item.id === presetSelect.value);
  if (!preset) return;
  repoPath.value = preset.path;
  command.value = preset.command;
  note.textContent = preset.note;
};

const loadPresets = async () => {
  const response = await fetch("/api/presets");
  const payload = await response.json();
  presets = payload.presets;

  presetSelect.innerHTML = "";
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.append(option);
  }

  syncPreset();
};

presetSelect.addEventListener("change", syncPreset);

pullButton.addEventListener("click", async () => {
  setBusy(true, "Pulling");
  exitCode.textContent = "-";
  appendOutput("Pulling latest with git fetch --prune && git pull --ff-only...");

  try {
    startPolling();
    const result = await requestJson("/api/pull", selectedPayload());
    pullTime.textContent = formatDuration(result.elapsedMs);
    exitCode.textContent = String(result.code);
    appendOutput(result.output);
    status.textContent = result.ok ? "Pulled" : "Failed";
  } catch (error) {
    status.textContent = "Failed";
    appendOutput(error.message);
  } finally {
    stopPolling();
    setBusy(false, status.textContent);
  }
});

runButton.addEventListener("click", async () => {
  setBusy(true, "Running");
  runTime.textContent = "-";
  exitCode.textContent = "-";
  appendOutput(`Running:\n${command.value.trim()}`);

  try {
    startPolling();
    const result = await requestJson("/api/run", selectedPayload());
    runTime.textContent = formatDuration(result.elapsedMs);
    exitCode.textContent = String(result.code);
    appendOutput(result.output);
    status.textContent = result.ok ? "Complete" : "Failed";
  } catch (error) {
    status.textContent = "Failed";
    appendOutput(error.message);
  } finally {
    stopPolling();
    setBusy(false, status.textContent);
  }
});

clearButton.addEventListener("click", () => {
  output.textContent = "";
});

loadPresets().catch((error) => {
  status.textContent = "Failed";
  appendOutput(error.message);
});
