# Well Mind Stress Analyzer

A private stress and mood tracker built with HTML, CSS, JavaScript, Node.js, Express, REST APIs, and MongoDB. Users can create an account, select from five mood stages, receive stage-specific tips, and review a daily and weekly stress estimate with practical wellbeing guidance.

## Run locally

1. Run locally without setting `MONGODB_URI` to use persistent JSON files under `data/` for development:

   ```powershell
   npm start
   ```

2. To use MongoDB locally, create a database (for example with MongoDB Atlas) and set its connection string before starting:

   ```powershell
   $env:MONGODB_URI = "your-mongodb-connection-string"
   $env:MONGODB_DB = "wellmindstress"
   npm install
   npm start
   ```

3. Open http://localhost:3000.

`MONGODB_DB` is optional when the connection string already names a database. With MongoDB configured, the server creates required indexes at startup and imports existing `data/users.json` and `data/diary.json` records without replacing records already in MongoDB. Production requires MongoDB; the local JSON fallback is development-only.

## Render deployment

Set the build command to `npm install` and the start command to `npm start`. Add `MONGODB_URI` in the Render service environment; optionally set `MONGODB_DB` and `NODE_ENV=production`. The session cookie is HttpOnly and SameSite=Lax, and is marked Secure in production.

## Stored data

MongoDB collections are `users`, `diaryEntries`, `moodEntries`, and `sessions`. User profiles, scrypt password hashes, diary entries, mood check-ins, and expiring login sessions are stored server-side. Diary entries, moods, and sessions are scoped to the authenticated user. Each mood stage maps to an estimated stress percentage. The weekly percentage is the average of the daily averages for days with check-ins, so days with more check-ins do not carry extra weight. These estimates are not clinical assessments. Chat messages and exercise activity are not retained.
