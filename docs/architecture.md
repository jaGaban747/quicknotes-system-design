# QuickNotes Architecture

This document describes how QuickNotes can be built to serve 1 million users reliably.

## 1. Requirements

### Functional requirements

* Users can register, log in and log out.
* Users can create, view, edit and delete their own notes.
* A note has a title of 1 to 100 characters and an optional body.
* Users can attach tags to notes and filter their notes by tag.
* Users can search their notes.
* The list of notes is paged, newest first.
* A user can only see and change their own notes.
* Notes are stored on the server, so a user sees the same notes on any device.

### Non functional requirements

* **Availability:** the service should be available 99.9 percent of the time, which allows about 8.8 hours of downtime per year.
* **Performance:** 95 percent of requests should finish in under 200 milliseconds.
* **Scalability:** it must handle 1 million users, and traffic peaks of 5 times the average, and grow further by adding servers.
* **Durability:** a saved note must never be lost, so data is copied to a second machine and backed up.
* **Consistency:** a user must see their own new or changed note straight away.
* **Security:** all traffic uses HTTPS, passwords are stored as hashes, and the server checks ownership on every request.
* **Observability:** logs and metrics make it possible to see errors and slow requests quickly.

## 2. Load estimate for 1 million users

### Assumptions

* 1,000,000 registered users
* 20 percent are active each day, so there are 200,000 daily active users
* Each active user makes 50 read requests per day (opening and refreshing the list, opening single notes and searching)
* Each active user makes 5 write requests per day (3 creates, 1 update and 1 delete)
* Peak traffic is 5 times the average
* A day has 86,400 seconds
* A stored note takes about 2 KB, including its tags and index entries

### Reads per second

* Reads per day: 200,000 x 50 = 10,000,000
* Average: 10,000,000 / 86,400 = about **116 reads per second**
* Peak: 116 x 5 = about **580 reads per second**

### Writes per second

* Writes per day: 200,000 x 5 = 1,000,000
* Average: 1,000,000 / 86,400 = about **12 writes per second**
* Peak: 12 x 5 = about **58 writes per second**

### Storage per year

* New notes per day: 200,000 x 3 = 600,000
* Storage per day: 600,000 x 2 KB = 1,200,000 KB = 1.2 GB
* Storage per year: 1.2 GB x 365 = about **440 GB**
* Accounts add very little: 1,000,000 users at about 0.5 KB each is roughly 500 MB in total
* The read replica holds a full copy, so total disk is roughly double, and backups need extra space

### What the numbers tell us

* QuickNotes is **read heavy**: reads outnumber writes about 10 to 1.
* Total peak traffic is about 640 requests per second. If one app server comfortably handles about 400 requests per second, two servers cover the peak, and we run three so the service survives the loss of one.
* A cache that answers 80 percent of reads leaves only about 116 reads per second at peak for the database.
* Storage is small by modern standards, so a single primary database is enough for a long time. Writes at 58 per second at peak are easy for one primary.

## 3. Architecture diagram

```
               Client (browser or mobile app)
                              |
                              v
                        +===========+
                        |    DNS    |
                        +===========+
                              |
                              v
                        +===========+
                        |    CDN    |
                        +===========+
                              |
                              v
                        +===========+
                        |    Load   |
                        |  Balancer |
                        +===========+
                              |
            +=================+=================+
            v                 v                 v
      +===========+     +===========+     +===========+
      | App Server|     | App Server|     | App Server|
      |     1     |     |     2     |     |     3     |
      +===========+     +===========+     +===========+
            |                 |                 |
            +=================+=================+
                              |
            +=================+=================+
            v                 v                 v
      +===========+     +===========+     +===========+
      |   Cache   |     |  Primary  |     |   Queue   |
      |           |     | Database  |     |           |
      +===========+     +===========+     +===========+
                              |                 |
                              v                 v
                        +===========+     +===========+
                        |    Read   |     | Background|
                        |  Replica  |     |   Worker  |
                        +===========+     +===========+
```

How to read it:

* A request travels down the diagram: the client finds the service through DNS, API calls pass through the CDN to the load balancer, and the load balancer chooses one of the app servers.
* The CDN answers by itself for static files such as the HTML, CSS and JavaScript of the front end.
* Every app server uses the same three services: the cache, the primary database and the queue.
* The primary database copies every change to the read replica.
* The worker takes jobs from the queue and writes any results to the database.

## 4. What each component does

* **Client:** It is the browser or mobile app that shows the notes and sends requests, so the user has something to interact with.
* **DNS:** It turns the service name into the address of the load balancer, which fixes the problem that computers find each other by number and not by name.
* **CDN:** It serves the static front end files from servers close to each user, which fixes slow page loads and keeps that traffic away from our own servers.
* **Load balancer:** It spreads incoming requests across the app servers and skips any that are unhealthy, which fixes both overload on one machine and downtime when a server fails.
* **App servers:** They run the API logic, check logins and ownership, and keep no data of their own, which means we can add more copies whenever traffic grows.
* **Cache:** It keeps answers that are asked for often in memory, which fixes the problem of the database answering the same question again and again.
* **Primary database:** It stores users, notes, tags and tag links and is the only place that accepts writes, which keeps the data correct and consistent.
* **Read replica:** It is a live copy of the primary that answers read queries, which fixes the problem of heavy reading slowing down writes and gives us a spare copy of the data.
* **Queue:** It holds slow background jobs, such as sending emails, until a worker is ready, which fixes the problem of an API reply having to wait for slow work.
* **Worker:** It takes jobs from the queue and carries them out, for example sending a welcome email or cleaning up expired login tokens, which keeps that work off the app servers.

## 5. Request flows

### GET /notes (list a user's notes)

1. The client sends `GET /api/v1/notes?page=1&limit=10` over HTTPS with its access token. DNS has already resolved the service name to the load balancer.
2. The load balancer forwards the request to a healthy app server.
3. The app server checks the token and finds out which user is asking.
4. The app server looks in the cache for that user's first page of notes.
5. If the page is in the cache, the app server skips to step 8.
6. If it is not in the cache, the app server asks the read replica for the user's newest 10 notes and their tags.
7. The app server builds the JSON response and saves it in the cache for a short time, such as 60 seconds.
8. The app server replies with `200 OK` and the JSON, and the client shows the notes.

### POST /notes (create a note)

1. The client sends `POST /api/v1/notes` with the JSON body and its access token.
2. The load balancer forwards the request to a healthy app server.
3. The app server checks the token and checks that the title is present and no longer than 100 characters. If not, it replies with `400 Bad Request`.
4. The app server writes the new note and any tag links to the primary database in one transaction.
5. The app server removes that user's cached pages so the cache cannot show an old list.
6. The app server marks that user so that their next few reads, for about 5 seconds, go to the primary database. This stops replica lag from hiding the note they just created.
7. If the action needs slow work, such as an email, the app server puts a job on the queue and the worker handles it later.
8. The app server replies with `201 Created`, the new note and its address in the Location header.

## 6. Trade offs

1. **Caching.** The cache makes reads much faster and protects the database, but a cached answer can be slightly out of date and the cache must be cleared correctly after changes. We accept this with a short expiry time and by clearing a user's cache entries on every write.
2. **Read replica.** It lets us scale reads and gives us a spare copy of the data, but the replica can lag a moment behind the primary, so data is only eventually consistent there. We accept this and send a user's reads to the primary for a few seconds after they write.
3. **Queue and worker.** Slow work no longer delays API replies and bursts of work are absorbed, but a job runs a little later than the request and we have more parts to build, run and watch. We accept this because the jobs, such as emails, do not need to finish before the user gets a reply.
4. **One primary database.** A single writer keeps the data simple and consistent, but all writes go through one machine, which limits growth. At about 58 writes per second at peak this is far from a problem, and if it ever becomes one we can split the data by user id.

## 7. Avoiding single points of failure

A single point of failure is one part whose failure would stop the whole service. Each component has a plan.

* **DNS:** we use a managed DNS provider that runs many name servers in different places.
* **CDN:** it is a worldwide network of many servers, so no single server matters.
* **Load balancer:** we run at least two, in different data centres, sharing one address, so if one fails the other takes over.
* **App servers:** there are at least three identical copies in different data centres. Because they keep no data of their own, the load balancer can send traffic to the healthy ones when any fails.
* **Cache:** it runs as a cluster with a replica. If the cache is lost, the app servers fall back to the database, which is slower but keeps the service working.
* **Primary database:** the read replica is ready to be promoted to primary if the primary fails, and we take regular backups with the ability to restore to a chosen moment.
* **Read replica:** we keep a second replica if needed, and if one fails reads go to the other or to the primary.
* **Queue and workers:** the queue stores jobs safely until they are done, and we run several workers, so a failed worker only means another worker picks up the job.
* **Whole data centre:** we spread the servers across at least two data centres, so the loss of one does not take the service down.