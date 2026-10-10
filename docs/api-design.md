# QuickNotes API Design

This document describes the real API that the backend team will build for QuickNotes. It is not the JSONPlaceholder practice API used by the client in this repository.

## Conventions

* Resources are plural nouns: users, notes and tags.
* Every path starts with `/api/v1`, so a future version 2 can change without breaking existing clients.
* Requests and responses use JSON.
* Every endpoint except registration and login needs a valid access token, sent in the authorization header as the word Bearer followed by the token.
* A user can only see and change their own notes.
* Timestamps are Unix time in seconds.
* Lists are paged with the query parameters `page` and `limit`. The default is page 1 with 10 items, and the maximum limit is 50.

## Note object

* `id`: number, assigned by the server
* `title`: string, required, 1 to 100 characters
* `body`: string, optional
* `userId`: number, the owner of the note
* `tags`: list of tag objects, each with an `id` and a `name`
* `createdAt`: number, Unix time in seconds
* `updatedAt`: number, Unix time in seconds

## Endpoints

### 1. Register a user

* **Method and path:** `POST /api/v1/users`
* **Description:** Creates a new account.
* **Example request body:**

```json
{
  "name": "Amina Wanjiku",
  "email": "amina@example.com",
  "password": "a long secret password"
}
```

* **Success status:** `201 Created`

### 2. Log in

* **Method and path:** `POST /api/v1/auth/login`
* **Description:** Checks the email and password and returns an access token.
* **Example request body:**

```json
{
  "email": "amina@example.com",
  "password": "a long secret password"
}
```

* **Success status:** `200 OK`, with a body such as `{ "token": "abc123", "expiresIn": 3600 }`

### 3. List notes

* **Method and path:** `GET /api/v1/notes`
* **Description:** Returns a page of the logged in user's notes, newest first. Optional query parameters are `page`, `limit`, `tag` (filter by tag name) and `q` (search the title and body).
* **Request body:** none
* **Success status:** `200 OK`

### 4. Get one note

* **Method and path:** `GET /api/v1/notes/{id}`
* **Description:** Returns the single note with the given id.
* **Request body:** none
* **Success status:** `200 OK`

### 5. Create a note

* **Method and path:** `POST /api/v1/notes`
* **Description:** Creates a note owned by the logged in user.
* **Example request body:** see the examples section below.
* **Success status:** `201 Created`, with the new note in the response and its address in the Location header

### 6. Update a note

* **Method and path:** `PUT /api/v1/notes/{id}`
* **Description:** Replaces the title, body and tags of an existing note.
* **Example request body:**

```json
{
  "title": "Buy milk and bread",
  "body": "Two litres of milk and one loaf",
  "tagIds": [1]
}
```

* **Success status:** `200 OK`, with the updated note

### 7. Delete a note

* **Method and path:** `DELETE /api/v1/notes/{id}`
* **Description:** Permanently removes the note.
* **Request body:** none
* **Success status:** `204 No Content`

### 8. List tags

* **Method and path:** `GET /api/v1/tags`
* **Description:** Returns all tags the user can attach to notes.
* **Request body:** none
* **Success status:** `200 OK`

### 9. Add a tag to a note

* **Method and path:** `POST /api/v1/notes/{id}/tags`
* **Description:** Attaches an existing tag to the note.
* **Example request body:**

```json
{
  "tagId": 2
}
```

* **Success status:** `201 Created`, with the note and its updated tags

### 10. Remove a tag from a note

* **Method and path:** `DELETE /api/v1/notes/{id}/tags/{tagId}`
* **Description:** Detaches the tag from the note. The tag itself is not deleted.
* **Request body:** none
* **Success status:** `204 No Content`

## Examples

### Create a note

Request: `POST /api/v1/notes`

```json
{
  "title": "Buy milk",
  "body": "Two litres of fresh milk",
  "tagIds": [1]
}
```

Response: `201 Created`

```json
{
  "id": 42,
  "title": "Buy milk",
  "body": "Two litres of fresh milk",
  "userId": 7,
  "tags": [
    { "id": 1, "name": "personal" }
  ],
  "createdAt": 1791622800,
  "updatedAt": 1791622800
}
```

### List notes

Request: `GET /api/v1/notes?page=1&limit=10`

Response: `200 OK`

```json
{
  "data": [
    {
      "id": 42,
      "title": "Buy milk",
      "body": "Two litres of fresh milk",
      "userId": 7,
      "tags": [
        { "id": 1, "name": "personal" }
      ],
      "createdAt": 1791622800,
      "updatedAt": 1791622800
    },
    {
      "id": 41,
      "title": "Email the report",
      "body": "",
      "userId": 7,
      "tags": [
        { "id": 2, "name": "work" }
      ],
      "createdAt": 1791536400,
      "updatedAt": 1791536400
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 2
}
```

## Error codes

Every error uses the same body shape: an `error` object with a machine readable `code` and a human readable `message`.

### 400 Bad Request

The request is malformed or fails validation.

* **When it happens:** A user sends `POST /api/v1/notes` with no title, or with a title longer than 100 characters, or sends text that is not valid JSON.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The title is required and must be 100 characters or fewer.",
    "field": "title"
  }
}
```

### 401 Unauthorized

The caller is not logged in.

* **When it happens:** A request to `GET /api/v1/notes` arrives with no access token, or with a token that has expired or is invalid. Login with a wrong password also returns 401.

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "The access token is missing or has expired."
  }
}
```

### 403 Forbidden

The caller is logged in but is not allowed to do this.

* **When it happens:** User 7 sends `DELETE /api/v1/notes/50` and note 50 belongs to user 9.

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to change this note."
  }
}
```

### 404 Not Found

The resource does not exist.

* **When it happens:** A user sends `GET /api/v1/notes/999` and no note with that id exists. The same applies to `PUT`, `DELETE` and the tag endpoints when the note or tag is missing.

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Note 999 was not found."
  }
}
```

### 500 Internal Server Error

Something failed on the server, and it is not the caller's fault.

* **When it happens:** The database is unreachable while a user creates a note, or the code hits an unexpected bug. The message never exposes internal details.

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong on our side. Please try again later."
  }
}
```

## Which errors each endpoint can return

* Every endpoint except registration and login can return 401 and 500.
* Endpoints that take a request body can return 400.
* Endpoints with a note id in the path can also return 403 and 404.
* Registration can also return 400 when the email is already registered or malformed.

## Design notes

* Nouns in the path and the HTTP method as the action keeps the API predictable: GET reads, POST creates, PUT replaces and DELETE removes.
* PUT and DELETE are safe to repeat, which helps clients that retry after a network failure.
* Paging keeps responses small for users with thousands of notes.
* Ownership checks happen on the server for every request, because the client cannot be trusted to enforce them.