# QuickNotes Data Model

This document describes the database behind the QuickNotes API. The SQL is written for SQLite, and the same design works in PostgreSQL or MySQL with small changes to the type names. All timestamps are stored as Unix time in whole seconds, matching the API design.

## Entities

### users

One row for each person with an account.

* `id`: INTEGER, **primary key**
* `name`: TEXT, required
* `email`: TEXT, required, unique
* `password_hash`: TEXT, required. We store only a hash of the password and never the password itself.
* `created_at`: INTEGER, required

### notes

One row for each note.

* `id`: INTEGER, **primary key**
* `user_id`: INTEGER, required, **foreign key** to `users(id)`. This is the owner of the note.
* `title`: TEXT, required, 1 to 100 characters
* `body`: TEXT, optional
* `created_at`: INTEGER, required
* `updated_at`: INTEGER, required

### tags

One row for each label that can be attached to notes, such as personal, work or study.

* `id`: INTEGER, **primary key**
* `name`: TEXT, required, unique

### note_tags

The join table that links notes to tags. One row means that one tag is attached to one note.

* `note_id`: INTEGER, required, **foreign key** to `notes(id)`
* `tag_id`: INTEGER, required, **foreign key** to `tags(id)`
* The **primary key** is the pair of `note_id` and `tag_id` together, which also stops the same tag being attached to the same note twice.

## Relationships

### One to many: users and notes

One user can own many notes, but each note belongs to exactly one user. The link is the foreign key `notes.user_id`. It always sits on the "many" side, because a single cell in the users table could not hold a list of notes.

### Many to many: notes and tags

One note can have many tags, and one tag can be attached to many notes. A relational table cannot store a list inside one cell, so a column of tag ids in `notes` or a column of note ids in `tags` would break the rule that each cell holds one value, and queries and updates would become messy. The join table `note_tags` solves this by splitting the many to many relationship into two one to many relationships: one note has many `note_tags` rows, and one tag has many `note_tags` rows.

### Rules the database enforces

* Two users cannot register with the same email, because `email` is unique.
* A note cannot exist without a real owner, because `user_id` is required and must match a row in `users`.
* A tag name cannot be duplicated, because `name` is unique.
* If a note is deleted, its rows in `note_tags` are deleted too, so no tag links are left pointing at a missing note.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body       TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
);

CREATE INDEX idx_notes_user_created ON notes (user_id, created_at);
CREATE INDEX idx_note_tags_tag ON note_tags (tag_id);
```

## Indexes

### Index on notes by user and creation time

`idx_notes_user_created` on `notes (user_id, created_at)` speeds up the most common request in the whole system, listing the logged in user's newest notes. Without it, the database would read every row in the notes table and filter by user. With millions of notes that would be slow and would get worse as the service grows. With the index the database jumps straight to one user's notes, already in time order, and reads only the ten it needs.

### Index on note_tags by tag

The primary key of `note_tags` already makes it fast to find all tags for one note. `idx_note_tags_tag` covers the opposite question, finding all notes that have a certain tag, which the tag filter on the list endpoint needs.

## Example queries

### 1. A user's newest notes, one page at a time

This serves `GET /api/v1/notes?page=1&limit=10`.

```sql
SELECT id, title, body, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 10 OFFSET 0;
```

### 2. Notes with their tags (JOIN)

This builds the tags list inside each note in the API response. It joins the notes table to the join table and then to the tags table.

```sql
SELECT n.id, n.title, t.name AS tag
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE n.user_id = 1
ORDER BY n.created_at DESC;
```

### 3. How many notes each tag has

A LEFT JOIN keeps tags that are not attached to any note, so they show a count of 0.

```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
GROUP BY t.id, t.name
ORDER BY note_count DESC;
```

### 4. Create a note

This serves `POST /api/v1/notes`.

```sql
INSERT INTO notes (user_id, title, body)
VALUES (1, 'Buy milk', 'Two litres of fresh milk');
```

### 5. Delete one of the user's notes

This serves `DELETE /api/v1/notes/{id}`. The user id in the condition makes sure users can only delete their own notes, and the linked rows in `note_tags` are removed automatically.

```sql
DELETE FROM notes
WHERE id = 42 AND user_id = 1;
```

## SQL or NoSQL

I would choose SQL for QuickNotes. The data is structured and connected: users own notes, and notes and tags are linked in a many to many relationship that is much easier to query with joins than to keep in sync across documents. SQL lets the database itself enforce the rules we care about, such as unique emails, notes that always belong to a real user, and no duplicate tag links, and its transactions keep a note and its tags consistent when several requests arrive at once. The size is also well within what a relational database handles for 1 million users, using a primary database with read replicas and an index on the main query. A NoSQL database would become attractive if the data grew to a size no single primary could handle, or if notes needed very different shapes of data, and at that point we could split the data across servers by user id. For now the strong consistency and joins of SQL fit the product better.