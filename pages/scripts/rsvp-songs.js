// RSVP "Requests so far" — the deduped song-request aggregate that used to
// live on the (now note-only) /songs page, shown UNDER the RSVP form for
// valid-token guests only. The gate script in ../rsvp.html flips
// <html data-rsvp-guest> and dispatches "rsvp:guest-validated" once the
// server validates the token; this module loads the list only then, so
// tokenless/unknown-token visitors never trigger a fetch. Dedupe/sort rules
// live in ../../shared/songs.js, which the server also uses — one
// implementation, tested by unit tests.

import { aggregateSongs } from "../../shared/songs.js";

const section = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="rsvp-requests-list"]')
);
const listEl = /** @type {HTMLUListElement | null} */ (
  document.querySelector('[data-testid="rsvp-requests-items"]')
);
const countEl = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="rsvp-requests-count"]')
);
const emptyEl = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="rsvp-requests-empty"]')
);
const loadingEl = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-testid="rsvp-requests-loading"]')
);

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
    render([]); // keep the section graceful when the list can't load
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }
}

function init() {
  if (!section || section.dataset.initialized) return; // exactly once
  section.dataset.initialized = "1";
  section.hidden = false;
  load();
}

// The gate script may validate before this module executes (the attribute
// check) or after (the event) — cover both orders, exactly once either way.
if (document.documentElement.hasAttribute("data-rsvp-guest")) {
  init();
} else {
  document.addEventListener("rsvp:guest-validated", init, { once: true });
}
