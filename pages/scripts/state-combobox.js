// State combobox for the /address form — a text input with typeahead
// filtering over the 50 US states + DC. Dependency-free, ARIA combobox
// pattern: ArrowUp/Down move, Enter picks, Escape closes, click picks.
// Free text is ALWAYS allowed (US territories and abroad addresses are
// typed as-is — the field stays a plain text input to the form and the
// server; nothing here validates). Options are built with DOM APIs and
// textContent — never innerHTML.

const US_STATES = [
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["District of Columbia", "DC"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
];

const inputEl = document.getElementById("address-state");
const listEl = document.getElementById("address-state-list");

if (inputEl instanceof HTMLInputElement && listEl instanceof HTMLUListElement) {
  const input = inputEl;
  const list = listEl;
  /** @type {HTMLElement[]} */ let options = [];
  let activeIndex = -1;

  function matches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return US_STATES;
    return US_STATES.filter(
      ([name, abbr]) =>
        name.toLowerCase().includes(q) || abbr.toLowerCase() === q,
    );
  }

  function buildList(query) {
    list.textContent = "";
    options = matches(query).map(([name, abbr]) => {
      const li = document.createElement("li");
      li.id = `address-state-opt-${abbr}`;
      li.className = "state-option";
      li.setAttribute("role", "option");
      li.dataset.value = abbr;

      const label = document.createElement("span");
      label.textContent = name;
      const code = document.createElement("span");
      code.className = "state-abbr";
      code.textContent = abbr;
      li.append(label, code);
      list.appendChild(li);
      return li;
    });
    activeIndex = options.length > 0 ? 0 : -1;
    syncActive();
  }

  function syncActive() {
    options.forEach((option, i) => {
      option.classList.toggle("active", i === activeIndex);
      option.setAttribute(
        "aria-selected",
        i === activeIndex ? "true" : "false",
      );
    });
    const active = options[activeIndex];
    if (active) {
      input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function open() {
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function select(option) {
    input.value = /** @type {string} */ (option.dataset.value);
    close();
  }

  input.addEventListener("input", () => {
    buildList(input.value);
    // No matches (e.g. a territory typed as-is): keep the typed text,
    // don't show an empty dropdown.
    if (options.length === 0) close();
    else open();
  });

  input.addEventListener("focus", () => {
    buildList(input.value);
    open();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) {
        buildList(input.value);
        if (options.length === 0) return;
        open();
        return;
      }
      if (options.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = (activeIndex + delta + options.length) % options.length;
      syncActive();
    } else if (event.key === "Enter") {
      if (!list.hidden && activeIndex >= 0) {
        event.preventDefault(); // don't submit the form mid-pick
        select(options[activeIndex]);
      }
    } else if (event.key === "Escape") {
      close();
    } else if (event.key === "Tab") {
      close(); // tab away keeps whatever was typed (free-text fallback)
    }
  });

  input.addEventListener("blur", close);

  // pointerdown (not click) so the pick lands before the input's blur.
  list.addEventListener("pointerdown", (event) => {
    const option = /** @type {HTMLElement} */ (event.target).closest(
      ".state-option",
    );
    if (!option) return;
    event.preventDefault(); // keep focus in the input
    select(option);
  });
}
