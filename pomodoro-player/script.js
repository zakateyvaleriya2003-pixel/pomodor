const builtInPlaylists = {
  lofi: {
    title: "Lo-fi Pulse",
    tracks: [
      { title: "Soft kick loop", kind: "Синтезатор", generator: "lofi" },
      { title: "Warm keys bed", kind: "Синтезатор", generator: "keys" },
      { title: "Late night pulse", kind: "Синтезатор", generator: "pulse" },
    ],
  },
  rain: {
    title: "Rain Room",
    tracks: [
      { title: "Window rain", kind: "Шум", generator: "rain" },
      { title: "Distant shower", kind: "Шум", generator: "rainSoft" },
      { title: "Quiet roof", kind: "Шум", generator: "rainDeep" },
    ],
  },
  brown: {
    title: "Brown Noise",
    tracks: [
      { title: "Brown noise low", kind: "Шум", generator: "brown" },
      { title: "Deep room tone", kind: "Шум", generator: "brownDeep" },
      { title: "Air conditioner", kind: "Шум", generator: "air" },
    ],
  },
};

const modeNames = {
  focus: "Фокус",
  shortBreak: "Короткий перерыв",
  longBreak: "Длинный перерыв",
  done: "Спринт завершен",
};

const timerDefaults = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  rounds: 4,
};

const playButton = document.querySelector("#play-button");
const resetButton = document.querySelector("#reset-button");
const skipButton = document.querySelector("#skip-button");
const timeDisplay = document.querySelector("#time-display");
const modeLabel = document.querySelector("#mode-label");
const roundLabel = document.querySelector("#round-label");
const progressFill = document.querySelector("#progress-fill");
const playlistSelect = document.querySelector("#playlist-select");
const trackList = document.querySelector("#track-list");
const nowPlaying = document.querySelector("#now-playing");
const musicToggleButton = document.querySelector("#music-toggle-button");
const volumeControl = document.querySelector("#volume-control");
const prevTrackButton = document.querySelector("#prev-track-button");
const nextTrackButton = document.querySelector("#next-track-button");
const dropZone = document.querySelector("#drop-zone");
const musicFilesInput = document.querySelector("#music-files");
const musicFolderInput = document.querySelector("#music-folder");
const uploadFilesButton = document.querySelector("#upload-files-button");
const uploadFolderButton = document.querySelector("#upload-folder-button");
const focusMinutesInput = document.querySelector("#focus-minutes");
const shortBreakMinutesInput = document.querySelector("#short-break-minutes");
const longBreakMinutesInput = document.querySelector("#long-break-minutes");
const roundCountInput = document.querySelector("#round-count");

let settings = { ...timerDefaults };
let timerId = null;
let mode = "focus";
let currentRound = 1;
let secondsLeft = settings.focusMinutes * 60;
let totalSeconds = secondsLeft;
let currentPlaylistId = "lofi";
let currentTrackIndex = 0;
let customTracks = [];
let musicEnabled = true;

class MusicEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.nodes = [];
    this.audio = new Audio();
    this.audio.loop = false;
    this.audio.addEventListener("ended", () => nextTrack(true));
  }

  ensureContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!this.context) {
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.setVolume(volumeControl.value);
    }

    return this.context;
  }

  setVolume(value) {
    const volume = Number(value) / 100;
    this.audio.volume = volume;

    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(volume * 0.42, this.context.currentTime);
    }
  }

  async play(track) {
    if (!musicEnabled || !track) {
      return;
    }

    this.stop();

    if (track.url) {
      this.audio.src = track.url;
      this.audio.currentTime = 0;
      await this.audio.play();
      return;
    }

    this.playGenerated(track.generator);
  }

  pause() {
    this.audio.pause();
    this.nodes.forEach((node) => {
      if (node.stop) {
        try {
          node.stop();
        } catch (error) {
          // The node may already be stopped by the browser.
        }
      }
    });
    this.nodes = [];
  }

  stop() {
    this.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  playGenerated(generatorName) {
    const context = this.ensureContext();

    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      context.resume();
    }

    const generator =
      generatorName.includes("rain") || generatorName.includes("brown") || generatorName === "air"
        ? "noise"
        : "tone";

    if (generator === "tone") {
      this.createToneLoop(generatorName);
      return;
    }

    this.createNoiseLoop(generatorName);
  }

  createToneLoop(generatorName) {
    const context = this.context;
    const baseFrequency = generatorName === "keys" ? 220 : generatorName === "pulse" ? 110 : 146.83;
    const secondFrequency = generatorName === "keys" ? 277.18 : generatorName === "pulse" ? 164.81 : 196;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const oscillatorA = context.createOscillator();
    const oscillatorB = context.createOscillator();
    const tremolo = context.createOscillator();
    const tremoloGain = context.createGain();

    filter.type = "lowpass";
    filter.frequency.value = 620;
    gain.gain.value = 0.12;
    oscillatorA.type = "triangle";
    oscillatorB.type = "sine";
    oscillatorA.frequency.value = baseFrequency;
    oscillatorB.frequency.value = secondFrequency;
    tremolo.frequency.value = generatorName === "pulse" ? 1.8 : 0.65;
    tremoloGain.gain.value = 0.035;

    tremolo.connect(tremoloGain);
    tremoloGain.connect(gain.gain);
    oscillatorA.connect(filter);
    oscillatorB.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    oscillatorA.start();
    oscillatorB.start();
    tremolo.start();
    this.nodes.push(oscillatorA, oscillatorB, tremolo);
  }

  createNoiseLoop(generatorName) {
    const context = this.context;
    const bufferSize = 2 * context.sampleRate;
    const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < bufferSize; i += 1) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      output[i] = lastOut * 3.5;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = noiseBuffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = generatorName.includes("rain") ? 1800 : 420;
    gain.gain.value = generatorName === "air" ? 0.18 : 0.24;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    this.nodes.push(source);
  }
}

const musicEngine = new MusicEngine();

function getCurrentPlaylist() {
  if (currentPlaylistId === "custom") {
    return {
      title: "Моя музыка",
      tracks: customTracks,
    };
  }

  return builtInPlaylists[currentPlaylistId];
}

function getCurrentTrack() {
  const playlist = getCurrentPlaylist();
  return playlist.tracks[currentTrackIndex] || playlist.tracks[0] || null;
}

function formatTime(total) {
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function clampNumber(input, fallback) {
  const value = Number(input.value);
  const min = Number(input.min);
  const max = Number(input.max);

  if (Number.isNaN(value)) {
    input.value = fallback;
    return fallback;
  }

  const clamped = Math.min(Math.max(value, min), max);
  input.value = clamped;
  return clamped;
}

function syncSettings() {
  settings = {
    focusMinutes: clampNumber(focusMinutesInput, timerDefaults.focusMinutes),
    shortBreakMinutes: clampNumber(shortBreakMinutesInput, timerDefaults.shortBreakMinutes),
    longBreakMinutes: clampNumber(longBreakMinutesInput, timerDefaults.longBreakMinutes),
    rounds: clampNumber(roundCountInput, timerDefaults.rounds),
  };
}

function setMode(nextMode) {
  mode = nextMode;

  if (mode === "focus") {
    secondsLeft = settings.focusMinutes * 60;
  } else if (mode === "shortBreak") {
    secondsLeft = settings.shortBreakMinutes * 60;
  } else if (mode === "longBreak") {
    secondsLeft = settings.longBreakMinutes * 60;
  } else {
    secondsLeft = 0;
  }

  totalSeconds = secondsLeft;
  render();
}

function renderTracks() {
  const playlist = getCurrentPlaylist();
  trackList.innerHTML = "";

  if (playlist.tracks.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "track-item";
    emptyItem.innerHTML = `
      <div>
        <div class="track-name">Добавь аудиофайлы</div>
        <div class="track-kind">MP3, WAV, OGG или M4A</div>
      </div>
    `;
    trackList.append(emptyItem);
    return;
  }

  playlist.tracks.forEach((track, index) => {
    const item = document.createElement("li");
    item.className = `track-item${index === currentTrackIndex ? " is-current" : ""}`;
    item.innerHTML = `
      <div>
        <div class="track-name">${track.title}</div>
        <div class="track-kind">${track.kind}</div>
      </div>
      <button class="mini-button" type="button">Выбрать</button>
    `;

    item.querySelector("button").addEventListener("click", () => {
      currentTrackIndex = index;
      renderTracks();
      updateNowPlaying();

      if (timerId && mode === "focus") {
        musicEngine.play(getCurrentTrack()).catch(showPlaybackMessage);
      }
    });

    trackList.append(item);
  });
}

function updateNowPlaying() {
  const track = getCurrentTrack();
  nowPlaying.textContent = track ? track.title : "Музыка не выбрана";
}

function render() {
  const elapsed = totalSeconds === 0 ? 0 : totalSeconds - secondsLeft;
  const progress = totalSeconds === 0 ? 100 : (elapsed / totalSeconds) * 100;

  timeDisplay.textContent = formatTime(secondsLeft);
  modeLabel.textContent = modeNames[mode];
  roundLabel.textContent =
    mode === "done" ? `${settings.rounds} из ${settings.rounds}` : `${currentRound} из ${settings.rounds}`;
  progressFill.style.width = `${progress}%`;
  playButton.textContent = timerId ? "Pause" : "Play";
  musicToggleButton.classList.toggle("is-active", musicEnabled);
  updateNowPlaying();
  renderTracks();
}

function showPlaybackMessage(error) {
  console.warn("Не удалось запустить музыку", error);
  nowPlaying.textContent = "Нажми Play еще раз";
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function pauseAll() {
  stopTimer();
  musicEngine.pause();
  render();
}

function startTimer() {
  if (mode === "done") {
    currentRound = 1;
    setMode("focus");
  }

  if (mode === "focus") {
    musicEngine.play(getCurrentTrack()).catch(showPlaybackMessage);
  }

  timerId = setInterval(tick, 1000);
  render();
}

function toggleTimer() {
  syncSettings();

  if (timerId) {
    pauseAll();
    return;
  }

  startTimer();
}

function resetTimer() {
  pauseAll();
  currentRound = 1;
  setMode("focus");
}

function completeCurrentMode() {
  if (mode === "focus") {
    musicEngine.pause();

    if (currentRound >= settings.rounds) {
      setMode("longBreak");
      return;
    }

    setMode("shortBreak");
    return;
  }

  if (mode === "longBreak") {
    stopTimer();
    musicEngine.pause();
    mode = "done";
    secondsLeft = 0;
    totalSeconds = settings.longBreakMinutes * 60;
    render();
    return;
  }

  currentRound += 1;
  setMode("focus");

  if (timerId) {
    musicEngine.play(getCurrentTrack()).catch(showPlaybackMessage);
  }
}

function tick() {
  if (secondsLeft <= 1) {
    completeCurrentMode();
    return;
  }

  secondsLeft -= 1;
  render();
}

function skipMode() {
  completeCurrentMode();
}

function selectPlaylist(playlistId) {
  currentPlaylistId = playlistId;
  currentTrackIndex = 0;
  musicEngine.stop();
  render();

  if (timerId && mode === "focus") {
    musicEngine.play(getCurrentTrack()).catch(showPlaybackMessage);
  }
}

function nextTrack(autoplay = false) {
  const playlist = getCurrentPlaylist();

  if (playlist.tracks.length === 0) {
    return;
  }

  currentTrackIndex = (currentTrackIndex + 1) % playlist.tracks.length;
  render();

  if (autoplay || (timerId && mode === "focus")) {
    musicEngine.play(getCurrentTrack()).catch(showPlaybackMessage);
  }
}

function previousTrack() {
  const playlist = getCurrentPlaylist();

  if (playlist.tracks.length === 0) {
    return;
  }

  currentTrackIndex = (currentTrackIndex - 1 + playlist.tracks.length) % playlist.tracks.length;
  render();

  if (timerId && mode === "focus") {
    musicEngine.play(getCurrentTrack()).catch(showPlaybackMessage);
  }
}

function addFiles(files) {
  const audioFiles = [...files].filter((file) => file.type.startsWith("audio/"));

  if (audioFiles.length === 0) {
    return;
  }

  const newTracks = audioFiles.map((file) => ({
    title: file.webkitRelativePath || file.name,
    kind: "Моя музыка",
    url: URL.createObjectURL(file),
  }));

  customTracks = [...customTracks, ...newTracks];
  playlistSelect.value = "custom";
  selectPlaylist("custom");
}

playButton.addEventListener("click", toggleTimer);
resetButton.addEventListener("click", resetTimer);
skipButton.addEventListener("click", skipMode);
playlistSelect.addEventListener("change", (event) => selectPlaylist(event.target.value));
musicToggleButton.addEventListener("click", () => {
  musicEnabled = !musicEnabled;

  if (!musicEnabled) {
    musicEngine.pause();
  } else if (timerId && mode === "focus") {
    musicEngine.play(getCurrentTrack()).catch(showPlaybackMessage);
  }

  render();
});
volumeControl.addEventListener("input", (event) => musicEngine.setVolume(event.target.value));
prevTrackButton.addEventListener("click", previousTrack);
nextTrackButton.addEventListener("click", () => nextTrack(false));
uploadFilesButton.addEventListener("click", () => musicFilesInput.click());
uploadFolderButton.addEventListener("click", () => musicFolderInput.click());
musicFilesInput.addEventListener("change", (event) => addFiles(event.target.files));
musicFolderInput.addEventListener("change", (event) => addFiles(event.target.files));

[focusMinutesInput, shortBreakMinutesInput, longBreakMinutesInput, roundCountInput].forEach((input) => {
  input.addEventListener("change", () => {
    syncSettings();

    if (!timerId) {
      currentRound = Math.min(currentRound, settings.rounds);
      setMode(mode === "done" ? "focus" : mode);
    }
  });
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

render();
