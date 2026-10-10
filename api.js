// 1. Constants and elements
const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadBtn = document.querySelector("#load-btn");
const statusEl = document.querySelector("#status");
const form = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");
const notesList = document.querySelector("#notes-list");

// The notes currently shown on the page
let notes = [];
const MAX_TITLE = 100;

// 2. Show a message in the status line (type: loading, success or error)
function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type;
}

// 3. One reusable function for every request.
// It checks response.ok and throws on errors, because fetch itself
// only fails on network problems, not on 404 or 500 responses.
async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`The server responded with status ${response.status}.`);
  }

  const data = await response.json().catch(() => null);
  return { status: response.status, data: data };
}

// 4. Draw the notes (user text goes in with textContent only)
function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.classList.add("empty-state");
    empty.textContent = "No notes to show yet.";
    notesList.append(empty);
    return;
  }

  notes.forEach((note) => {
    const li = document.createElement("li");
    li.classList.add("note");

    const title = document.createElement("h3");
    title.textContent = note.title;

    const body = document.createElement("p");
    body.textContent = note.body;

    li.append(title, body);
    notesList.append(li);
  });
}

// 5. GET: load 10 notes
async function loadNotes() {
  loadBtn.disabled = true;
  setStatus("Loading notes...", "loading");

  try {
    const result = await request(`${API_URL}?_limit=10`);
    notes = result.data;
    renderNotes();
    setStatus(`Loaded ${notes.length} notes from the server.`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Sorry, we could not load the notes. Please try again.", "error");
  } finally {
    loadBtn.disabled = false;
  }
}

// 6. Validation: a title is required, up to 100 characters. The body is optional.
function validateTitle(title) {
  if (title === "") return "A title is required.";
  if (title.length > MAX_TITLE) {
    return `The title must be ${MAX_TITLE} characters or fewer (yours is ${title.length}).`;
  }
  return "";
}

// 7. POST: create a note
async function createNote(title, body) {
  submitBtn.disabled = true;
  setStatus("Creating note...", "loading");

  try {
    const result = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ title: title, body: body, userId: 1 }),
    });

    // The server echoes the note back with a new id. isLocal marks notes that
    // only exist on this page, because JSONPlaceholder does not really save them.
    const created = { ...result.data, isLocal: true };
    notes.unshift(created);
    renderNotes();
    setStatus(
      `Note created (status ${result.status}, id ${created.id}).`,
      "success"
    );
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus("Sorry, we could not create the note. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

// 8. Listeners
loadBtn.addEventListener("click", loadNotes);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    setStatus(problem, "error");
    titleInput.focus();
    return;
  }

  createNote(title, body);
});