// Songs page behavior — form validation, submit, and the live "Requests so far"
// list. Dedupe/sort rules live in ../../shared/songs.js, which the server also
// uses — one implementation, tested by unit tests.

import { aggregateSongs } from "../../shared/songs.js";

const form = /** @type {HTMLFormElement} */ (
  document.getElementById("song-form")
);
const submitBtn = /** @type {HTMLButtonElement | null} */ (
  document.querySelector('[data-testid="song-submit"]')
);
const formError = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="song-form-error"]')
);
const successBox = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="song-success"]')
);
const listEl = /** @type {HTMLUListElement | null} */ (
  document.querySelector('[data-testid="songs-list"]')
);
const countEl = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="songs-count"]')
);
const emptyEl = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="songs-empty"]')
);
const loadingEl = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="songs-loading"]')
);

function setError(field, message) {
  const el = /** @type {HTMLElement | null} */ (
    document.querySelector(`[data-testid="song-${field}-error"]`)
  );
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
  const input = document.getElementById(`song-${field}`);
  if (input) {
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
}

function setFormError(message) {
  if (!formError) return;
  formError.textContent = message;
  formError.hidden = !message;
}

function render(rows) {
  const aggregated = aggregateSongs(rows);
  if (countEl) {
    const total = rows.length;
    const unique = aggregated.length;
    countEl.textContent = `${total} request${total === 1 ? "" : "s"} so far · ${unique} song${unique === 1 ? "" : "s"}`;
  }
  if (emptyEl) emptyEl.hidden = aggregated.length > 0;
  if (!listEl) return;
  listEl.innerHTML = "";
  for (const song of aggregated) {
    const li = document.createElement("li");
    li.className = "song-item";
    li.setAttribute("data-testid", "song-item");

    const wrap = document.createElement("span");
    wrap.className = "song-title-artist";

    const title = document.createElement("strong");
    title.setAttribute("data-testid", "song-title-text");
    title.textContent = song.title;

    const artist = document.createElement("span");
    artist.setAttribute("data-testid", "song-artist-text");
    artist.textContent = ` — ${song.artist}`;

    wrap.append(title, artist);

    if (song.requestedBy) {
      const by = document.createElement("span");
      by.className = "song-by";
      by.textContent = `first requested by ${song.requestedBy}`;
      wrap.appendChild(by);
    }

    const count = document.createElement("span");
    count.className = "song-count";
    count.setAttribute("data-testid", "song-count");
    count.textContent = `×${song.count}`;

    li.append(wrap, count);
    listEl.appendChild(li);
  }
}

async function load() {
  try {
    const res = await fetch("/api/songs");
    const data = await res.json();
    render(data.songs ?? []);
  } catch {
    render([]);
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("title", "");
  setError("artist", "");
  setError("name", "");
  setFormError("");

  // NB: use elements.namedItem — `form.title`/`form.name` collide with
  // built-in HTMLFormElement properties at runtime.
  const title = /** @type {HTMLInputElement} */ (
    form.elements.namedItem("title")
  ).value;
  const artist = /** @type {HTMLInputElement} */ (
    form.elements.namedItem("artist")
  ).value;
  const requestedBy = /** @type {HTMLInputElement} */ (
    form.elements.namedItem("requested_by")
  ).value;

  let valid = true;
  if (!title.trim()) {
    setError("title", "Please tell us the song title.");
    valid = false;
  } else if (title.trim().length > 200) {
    setError("title", "Title must be 200 characters or fewer.");
    valid = false;
  }
  if (!artist.trim()) {
    setError("artist", "Please tell us the artist.");
    valid = false;
  } else if (artist.trim().length > 200) {
    setError("artist", "Artist must be 200 characters or fewer.");
    valid = false;
  }
  if (!requestedBy.trim()) {
    setError("name", "Please add your name.");
    valid = false;
  } else if (requestedBy.trim().length > 120) {
    setError("name", "Name must be 120 characters or fewer.");
    valid = false;
  }
  if (!valid) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
  }

  try {
    const res = await fetch("/api/song", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        artist: artist.trim(),
        requested_by: requestedBy.trim(),
      }),
    });

    if (res.status === 201 || res.ok) {
      form.reset();
      if (successBox) successBox.hidden = false;
      await load();
      return;
    }

    if (res.status === 422) {
      const data = await res.json().catch(() => null);
      if (data?.errors) {
        if (data.errors.title) setError("title", data.errors.title);
        if (data.errors.artist) setError("artist", data.errors.artist);
        if (data.errors.requested_by)
          setError("name", data.errors.requested_by);
      }
      setFormError("Please take another look at the highlighted fields.");
      return;
    }

    if (res.status === 503) {
      setFormError(
        "Song requests aren't available just yet — please try again soon.",
      );
      return;
    }

    setFormError("Something went wrong — please try again in a moment.");
  } catch {
    setFormError(
      "We couldn't reach the server — check your connection and try again.",
    );
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Request Song";
    }
  }
});

load();
