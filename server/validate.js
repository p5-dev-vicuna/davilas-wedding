// Pure validation for the API payloads — no framework imports, so unit
// tests cover these functions directly.

export const RSVP_LIMITS = {
  name: 120,
  allergies: 500,
  song: 200,
  notes: 1000,
  partyMin: 1,
  partyMax: 10,
};
export const SONG_LIMITS = { title: 200, artist: 200, name: 120 };
export const ADDRESS_LIMITS = {
  name: 120,
  street: 200,
  unit: 30,
  city: 100,
  state: 50,
  postal: 20,
  country: 100,
  notes: 500,
  token: 64,
};

function str(value) {
  return typeof value === "string" ? value.trim() : null;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate an RSVP payload.
 * @returns {{ ok: true, value: { full_name: string, attending: boolean, party_size: number, allergies: string | null, song_request: string | null, notes: string | null } } | { ok: false, errors: Record<string, string> }}
 */
export function validateRsvp(input) {
  if (!isPlainObject(input)) {
    return { ok: false, errors: { _form: "Expected a JSON object." } };
  }

  const errors = {};

  const full_name = str(input.full_name);
  if (!full_name) {
    errors.full_name = "Please tell us your full name.";
  } else if (full_name.length > RSVP_LIMITS.name) {
    errors.full_name = `Name must be ${RSVP_LIMITS.name} characters or fewer.`;
  }

  let attending = input.attending;
  if (attending === "true") attending = true;
  else if (attending === "false") attending = false;
  if (typeof attending !== "boolean") {
    errors.attending = "Please choose whether you will attend.";
  }

  let party_size = input.party_size;
  if (typeof party_size === "string" && party_size.trim() !== "") {
    const asNumber = Number(party_size);
    if (Number.isInteger(asNumber)) party_size = asNumber;
  }
  if (party_size === undefined || party_size === null || party_size === "") {
    errors.party_size = "Please tell us your party size.";
  } else if (
    typeof party_size !== "number" ||
    !Number.isInteger(party_size) ||
    party_size < RSVP_LIMITS.partyMin ||
    party_size > RSVP_LIMITS.partyMax
  ) {
    errors.party_size = `Party size must be a whole number between ${RSVP_LIMITS.partyMin} and ${RSVP_LIMITS.partyMax}.`;
  }

  const allergies = str(input.allergies);
  if (allergies && allergies.length > RSVP_LIMITS.allergies) {
    errors.allergies = `Please keep this under ${RSVP_LIMITS.allergies} characters.`;
  }

  const song_request = str(input.song_request);
  if (song_request && song_request.length > RSVP_LIMITS.song) {
    errors.song_request = `Please keep song requests under ${RSVP_LIMITS.song} characters.`;
  }

  const notes = str(input.notes);
  if (notes && notes.length > RSVP_LIMITS.notes) {
    errors.notes = `Please keep notes under ${RSVP_LIMITS.notes} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // The guards above established these are non-null/non-empty; narrow for TS.
  const value =
    /** @type {{ full_name: string, attending: boolean, party_size: number, allergies: string | null, song_request: string | null, notes: string | null }} */ ({
      full_name,
      attending,
      party_size,
      allergies: allergies || null,
      song_request: song_request || null,
      notes: notes || null,
    });
  return { ok: true, value };
}

/**
 * Validate a song-request payload.
 * @returns {{ ok: true, value: { title: string, artist: string, requested_by: string } } | { ok: false, errors: Record<string, string> }}
 */
export function validateSong(input) {
  if (!isPlainObject(input)) {
    return { ok: false, errors: { _form: "Expected a JSON object." } };
  }

  const errors = {};

  const title = str(input.title);
  if (!title) {
    errors.title = "Please tell us the song title.";
  } else if (title.length > SONG_LIMITS.title) {
    errors.title = `Title must be ${SONG_LIMITS.title} characters or fewer.`;
  }

  const artist = str(input.artist);
  if (!artist) {
    errors.artist = "Please tell us the artist.";
  } else if (artist.length > SONG_LIMITS.artist) {
    errors.artist = `Artist must be ${SONG_LIMITS.artist} characters or fewer.`;
  }

  const requested_by = str(input.requested_by);
  if (!requested_by) {
    errors.requested_by = "Please add your name.";
  } else if (requested_by.length > SONG_LIMITS.name) {
    errors.requested_by = `Name must be ${SONG_LIMITS.name} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // The guards above established these are non-null/non-empty; narrow for TS.
  const value =
    /** @type {{ title: string, artist: string, requested_by: string }} */ ({
      title,
      artist,
      requested_by,
    });
  return { ok: true, value };
}

/**
 * Validate a mailing-address payload (pre-RSVP address capture).
 * `guest_token` is the silent ?g=<token> from a personal SMS link — optional,
 * stored as-is when present. `country` defaults to 'USA' when omitted.
 * @returns {{ ok: true, value: { full_name: string, street: string, unit: string | null, city: string, state: string, postal_code: string, country: string, notes: string | null, guest_token: string | null } } | { ok: false, errors: Record<string, string> }}
 */
export function validateAddress(input) {
  if (!isPlainObject(input)) {
    return { ok: false, errors: { _form: "Expected a JSON object." } };
  }

  const errors = {};

  const full_name = str(input.full_name);
  if (!full_name) {
    errors.full_name = "Please add the name(s) for your envelope.";
  } else if (full_name.length > ADDRESS_LIMITS.name) {
    errors.full_name = `Name must be ${ADDRESS_LIMITS.name} characters or fewer.`;
  }

  const street = str(input.street);
  if (!street) {
    errors.street = "Please add your street address.";
  } else if (street.length > ADDRESS_LIMITS.street) {
    errors.street = `Street address must be ${ADDRESS_LIMITS.street} characters or fewer.`;
  }

  const unit = str(input.unit);
  if (unit && unit.length > ADDRESS_LIMITS.unit) {
    errors.unit = `Apt / unit must be ${ADDRESS_LIMITS.unit} characters or fewer.`;
  }

  const city = str(input.city);
  if (!city) {
    errors.city = "Please add your city.";
  } else if (city.length > ADDRESS_LIMITS.city) {
    errors.city = `City must be ${ADDRESS_LIMITS.city} characters or fewer.`;
  }

  const state = str(input.state);
  if (!state) {
    errors.state = "Please add your state.";
  } else if (state.length > ADDRESS_LIMITS.state) {
    errors.state = `State must be ${ADDRESS_LIMITS.state} characters or fewer.`;
  }

  const postal_code = str(input.postal_code);
  if (!postal_code) {
    errors.postal_code = "Please add your ZIP / postal code.";
  } else if (postal_code.length > ADDRESS_LIMITS.postal) {
    errors.postal_code = `ZIP / postal code must be ${ADDRESS_LIMITS.postal} characters or fewer.`;
  }

  const country = str(input.country);
  if (country && country.length > ADDRESS_LIMITS.country) {
    errors.country = `Country must be ${ADDRESS_LIMITS.country} characters or fewer.`;
  }

  const notes = str(input.notes);
  if (notes && notes.length > ADDRESS_LIMITS.notes) {
    errors.notes = `Please keep this under ${ADDRESS_LIMITS.notes} characters.`;
  }

  const guest_token = str(input.guest_token);
  if (guest_token && guest_token.length > ADDRESS_LIMITS.token) {
    errors.guest_token =
      "Please open your personal link from the text message and try again.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // The guards above established these are non-null/non-empty; narrow for TS.
  const value =
    /** @type {{ full_name: string, street: string, unit: string | null, city: string, state: string, postal_code: string, country: string, notes: string | null, guest_token: string | null }} */ ({
      full_name,
      street,
      unit: unit || null,
      city,
      state,
      postal_code,
      country: country || "USA",
      notes: notes || null,
      guest_token: guest_token || null,
    });
  return { ok: true, value };
}
