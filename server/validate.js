// Pure validation for the API payloads — no framework imports, so unit
// tests cover these functions directly.

export const RSVP_LIMITS = { name: 120, allergies: 500, song: 200, notes: 1000, partyMin: 1, partyMax: 10 }
export const SONG_LIMITS = { title: 200, artist: 200, name: 120 }

function str(value) {
  return typeof value === 'string' ? value.trim() : null
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate an RSVP payload.
 * @returns {{ ok: true, value: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateRsvp(input) {
  if (!isPlainObject(input)) {
    return { ok: false, errors: { _form: 'Expected a JSON object.' } }
  }

  const errors = {}

  const full_name = str(input.full_name)
  if (!full_name) {
    errors.full_name = 'Please tell us your full name.'
  } else if (full_name.length > RSVP_LIMITS.name) {
    errors.full_name = `Name must be ${RSVP_LIMITS.name} characters or fewer.`
  }

  let attending = input.attending
  if (attending === 'true') attending = true
  else if (attending === 'false') attending = false
  if (typeof attending !== 'boolean') {
    errors.attending = 'Please choose whether you will attend.'
  }

  let party_size = input.party_size
  if (typeof party_size === 'string' && party_size.trim() !== '') {
    const asNumber = Number(party_size)
    if (Number.isInteger(asNumber)) party_size = asNumber
  }
  if (party_size === undefined || party_size === null || party_size === '') {
    errors.party_size = 'Please tell us your party size.'
  } else if (
    typeof party_size !== 'number' ||
    !Number.isInteger(party_size) ||
    party_size < RSVP_LIMITS.partyMin ||
    party_size > RSVP_LIMITS.partyMax
  ) {
    errors.party_size = `Party size must be a whole number between ${RSVP_LIMITS.partyMin} and ${RSVP_LIMITS.partyMax}.`
  }

  const allergies = str(input.allergies)
  if (allergies && allergies.length > RSVP_LIMITS.allergies) {
    errors.allergies = `Please keep this under ${RSVP_LIMITS.allergies} characters.`
  }

  const song_request = str(input.song_request)
  if (song_request && song_request.length > RSVP_LIMITS.song) {
    errors.song_request = `Please keep song requests under ${RSVP_LIMITS.song} characters.`
  }

  const notes = str(input.notes)
  if (notes && notes.length > RSVP_LIMITS.notes) {
    errors.notes = `Please keep notes under ${RSVP_LIMITS.notes} characters.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      full_name,
      attending,
      party_size,
      allergies: allergies || null,
      song_request: song_request || null,
      notes: notes || null,
    },
  }
}

/**
 * Validate a song-request payload.
 * @returns {{ ok: true, value: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateSong(input) {
  if (!isPlainObject(input)) {
    return { ok: false, errors: { _form: 'Expected a JSON object.' } }
  }

  const errors = {}

  const title = str(input.title)
  if (!title) {
    errors.title = 'Please tell us the song title.'
  } else if (title.length > SONG_LIMITS.title) {
    errors.title = `Title must be ${SONG_LIMITS.title} characters or fewer.`
  }

  const artist = str(input.artist)
  if (!artist) {
    errors.artist = 'Please tell us the artist.'
  } else if (artist.length > SONG_LIMITS.artist) {
    errors.artist = `Artist must be ${SONG_LIMITS.artist} characters or fewer.`
  }

  const requested_by = str(input.requested_by)
  if (!requested_by) {
    errors.requested_by = 'Please add your name.'
  } else if (requested_by.length > SONG_LIMITS.name) {
    errors.requested_by = `Name must be ${SONG_LIMITS.name} characters or fewer.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return { ok: true, value: { title, artist, requested_by } }
}
