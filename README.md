# QuickNotes System Design

QuickNotes is moving from a browser only app to an online service for 1 million users. This repository holds two things. The first is a small API client that proves the front end can talk to a real API, using the JSONPlaceholder practice API to load, create and delete notes. The second is a set of design documents that the backend team can build the real service from: the API, the database and the overall architecture.

## What is in this repository

* `index.html`, `style.css` and `api.js`: the API client
* `docs/api-design.md`: the REST API for the real QuickNotes service
* `docs/data-model.md`: the database tables, relationships, SQL and indexes
* `docs/architecture.md`: requirements, load estimates, the architecture diagram and the request flows

## Features of the API client

* Loads 10 notes with a GET request and shows each title and body
* Creates a note with a POST request, with the title validated (required, up to 100 characters)
* Deletes a note with a DELETE request
* Shows loading, success, error and empty states in the status line
* Disables the buttons while a request is running
* Puts user text on the page with `textContent` only

## How to run the API client

1. Clone the repository:

```bash
   git clone https://github.com/jaGaban747/quicknotes-system-design.git
```

2. Open the folder in VS Code or any editor that supports the Live Server extension.
3. Right click `index.html` and choose **Open with Live Server**.
4. Click **Load notes** to fetch notes, use the form to add one, and click **Delete** on a note to remove it.

There is nothing to install and no build step. The client needs an internet connection, because it calls the JSONPlaceholder API.

JSONPlaceholder only pretends to save changes. A note you create gets an id, but the server does not store it, so it exists only on the page. Deleting a note you loaded sends a real request, but the server keeps the note and it returns the next time you load. The comment in `api.js` explains how the client handles this.

## Design documents

* [API design](docs/api-design.md)
* [Data model](docs/data-model.md)
* [Architecture](docs/architecture.md)

## What I learned

* I learned that fetch does not fail on a 404 or a 500 response, so I wrote one reusable request() function that checks response.ok and throws an error. Every request now goes through it, with try, catch and finally to show friendly messages and re-enable the buttons.
* I learned that a fake API behaves differently from a real one. JSONPlaceholder returns the same id for every created note and never stores anything, so I had to handle notes created on the page differently from notes loaded from the server, and explain that in a comment.
* I learned how to turn requirements into numbers and then into a design. Working out that QuickNotes has about 10 reads for every write, and about 640 requests per second at peak, showed me why it needs a cache, a read replica and more than one app server, and how each one removes a single point of failure.