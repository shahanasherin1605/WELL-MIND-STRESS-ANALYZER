const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DIARY_FILE = path.join(DATA_DIR, 'diary.json');
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MOOD_STRESS = { Heavy: 85, Uneasy: 65, Okay: 45, Bright: 25, Hopeful: 15 };
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

class LocalCursor {
  constructor(documents) {
    this.documents = documents;
  }

  sort(order) {
    this.documents.sort((left, right) => {
      for (const [field, direction] of Object.entries(order)) {
        const result = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
        if (result) return result * direction;
      }
      return 0;
    });
    return this;
  }

  limit(count) {
    this.documents = this.documents.slice(0, count);
    return this;
  }

  async toArray() {
    return this.documents;
  }

  async next() {
    return this.documents[0] || null;
  }
}

class LocalCollection {
  constructor(name) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.filePath = path.join(DATA_DIR, `local-${name}.json`);
  }

  read() {
    return fs.existsSync(this.filePath) ? JSON.parse(fs.readFileSync(this.filePath, 'utf8')) : [];
  }

  write(documents) {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(documents, null, 2));
    fs.renameSync(temporaryPath, this.filePath);
  }

  matches(document, filter) {
    return Object.entries(filter).every(([field, expected]) => {
      const actual = document[field];
      if (!expected || typeof expected !== 'object' || expected instanceof Date || Array.isArray(expected)) return actual === expected;
      return Object.entries(expected).every(([operator, value]) => {
        const comparableActual = value instanceof Date ? new Date(actual).getTime() : actual;
        const comparableValue = value instanceof Date ? value.getTime() : value;
        if (operator === '$gt') return comparableActual > comparableValue;
        if (operator === '$gte') return comparableActual >= comparableValue;
        return false;
      });
    });
  }

  async findOne(filter) {
    return this.read().find((document) => this.matches(document, filter)) || null;
  }

  async insertOne(document) {
    const documents = this.read();
    if (documents.some((item) => item._id === document._id)) {
      const error = new Error('Duplicate key');
      error.code = 11000;
      throw error;
    }
    documents.push(document);
    this.write(documents);
    return { insertedId: document._id };
  }

  find(filter) {
    return new LocalCursor(this.read().filter((document) => this.matches(document, filter)));
  }

  async findOneAndUpdate(filter, update) {
    const documents = this.read();
    const index = documents.findIndex((document) => this.matches(document, filter));
    if (index < 0) return null;
    documents[index] = { ...documents[index], ...update.$set };
    this.write(documents);
    return documents[index];
  }

  async countDocuments(filter) {
    return this.read().filter((document) => this.matches(document, filter)).length;
  }

  async deleteOne(filter) {
    const documents = this.read();
    const index = documents.findIndex((document) => this.matches(document, filter));
    if (index < 0) return { deletedCount: 0 };
    documents.splice(index, 1);
    this.write(documents);
    return { deletedCount: 1 };
  }

  async bulkWrite(operations) {
    const documents = this.read();
    for (const operation of operations) {
      const { filter, update, upsert } = operation.updateOne;
      if (upsert && !documents.some((document) => this.matches(document, filter))) documents.push(update.$setOnInsert);
    }
    this.write(documents);
  }

  async createIndex() {}
}

function createLocalDatabase() {
  return { collection: (name) => new LocalCollection(name) };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function passwordMatches(password, storedPassword) {
  const [salt, storedHash] = String(storedPassword || '').split(':');
  if (!salt || !/^[a-f0-9]{128}$/i.test(storedHash || '')) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function publicProfile(user) {
  return { id: user.id, name: user.name, email: user.email, bio: user.bio || '', pronouns: user.pronouns || '', createdAt: user.createdAt };
}

function sessionCookie(sessionId, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `wellMindSession=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function readSessionId(request) {
  const cookie = (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('wellMindSession='));
  return cookie ? cookie.slice('wellMindSession='.length) : '';
}

function publicEntry(entry) {
  const { _id, ...fields } = entry;
  return { id: _id, ...fields };
}

function stressGuidanceFor(score) {
  if (score === null) return null;
  if (score <= 25) return { title: 'Keep supporting what is working', copy: 'Protect the routines that help you feel steady: regular rest, nourishing meals, movement you enjoy, and time with people you trust.' };
  if (score <= 50) return { title: 'Make room for small resets', copy: 'Try breaking one task into a smaller step, taking a short screen-free pause, and keeping a steady sleep and meal routine.' };
  if (score <= 75) return { title: 'Ease some of the pressure', copy: 'Pause for a slow exhale, choose one priority, and consider sharing what is weighing on you with someone you trust.' };
  return { title: 'Put support first today', copy: 'Focus on immediate needs and reach out to someone you trust. A mental health professional can help if this level of stress persists or feels hard to manage.' };
}

async function importLegacyFile(filePath, collection) {
  if (!fs.existsSync(filePath)) return;
  const records = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(records) || records.length === 0) return;
  await collection.bulkWrite(records.filter((record) => record.id).map((record) => ({
    updateOne: { filter: { _id: record.id }, update: { $setOnInsert: { _id: record.id, ...record } }, upsert: true }
  })), { ordered: false });
}

function createSession(database, userId, response) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
  return database.collection('sessions').insertOne({ _id: sessionId, userId, expiresAt }).then(() => {
    response.set('Set-Cookie', sessionCookie(sessionId, SESSION_MAX_AGE_MS / 1000));
  });
}

function createApp(database) {
  const users = database.collection('users');
  const diaryEntries = database.collection('diaryEntries');
  const moodEntries = database.collection('moodEntries');
  const sessions = database.collection('sessions');

  async function requireUser(request, response, next) {
    try {
      const sessionId = readSessionId(request);
      if (!sessionId) return response.status(401).json({ error: 'Not signed in.' });
      const session = await sessions.findOne({ _id: sessionId, expiresAt: { $gt: new Date() } });
      const user = session && await users.findOne({ _id: session.userId });
      if (!user) return response.status(401).json({ error: 'Not signed in.' });
      request.user = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  app.post(['/api/signup', '/api/signin'], async (request, response, next) => {
    try {
      const { name, email, password } = request.body || {};
      const cleanPassword = typeof password === 'string' ? password : '';
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || cleanPassword.length < 6 || cleanPassword.length > 1024) {
        return response.status(400).json({ error: 'Enter a valid email and a password with at least 6 characters.' });
      }
      const existingUser = await users.findOne({ email: normalizedEmail });
      if (request.path === '/api/signup') {
        const cleanName = String(name || '').trim();
        if (!cleanName) return response.status(400).json({ error: 'Please enter your name.' });
        if (existingUser) return response.status(409).json({ error: 'An account with this email already exists.' });
        const user = { _id: crypto.randomUUID(), name: cleanName.slice(0, 60), email: normalizedEmail, password: hashPassword(cleanPassword), bio: '', pronouns: '', createdAt: new Date().toISOString() };
        await users.insertOne(user);
        await createSession(database, user._id, response);
        return response.status(201).json({ user: publicProfile({ ...user, id: user._id }) });
      }
      if (!existingUser || !passwordMatches(cleanPassword, existingUser.password)) return response.status(401).json({ error: 'That email and password combination was not recognized.' });
      await createSession(database, existingUser._id, response);
      return response.json({ user: publicProfile({ ...existingUser, id: existingUser._id }) });
    } catch (error) {
      if (error.code === 11000) return response.status(409).json({ error: 'An account with this email already exists.' });
      next(error);
    }
  });

  app.get('/api/me', requireUser, (request, response) => response.json({ user: publicProfile({ ...request.user, id: request.user._id }) }));

  app.patch('/api/profile', requireUser, async (request, response, next) => {
    try {
      const { name, bio, pronouns } = request.body || {};
      const nextName = String(name || '').trim();
      if (!nextName) return response.status(400).json({ error: 'Your name cannot be empty.' });
      const savedUser = await users.findOneAndUpdate(
        { _id: request.user._id },
        { $set: { name: nextName.slice(0, 60), bio: String(bio || '').trim().slice(0, 160), pronouns: String(pronouns || '').trim().slice(0, 30) } },
        { returnDocument: 'after' }
      );
      return response.json({ user: publicProfile({ ...savedUser, id: savedUser._id }) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/diary', requireUser, async (request, response, next) => {
    try {
      const entries = await diaryEntries.find({ userId: request.user._id }).sort({ createdAt: -1 }).toArray();
      return response.json({ entries: entries.map(publicEntry) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/diary', requireUser, async (request, response, next) => {
    try {
      const { title, body, mood } = request.body || {};
      const cleanBody = String(body || '').trim();
      if (!cleanBody) return response.status(400).json({ error: 'Write a few words before saving your diary entry.' });
      const entry = {
        _id: crypto.randomUUID(),
        userId: request.user._id,
        title: String(title || 'A moment with myself').trim().slice(0, 80) || 'A moment with myself',
        body: cleanBody.slice(0, 3000),
        mood: String(mood || 'Reflective').trim().slice(0, 30),
        createdAt: new Date().toISOString()
      };
      await diaryEntries.insertOne(entry);
      return response.status(201).json({ entry: publicEntry(entry) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/moods', requireUser, async (request, response, next) => {
    try {
      const mood = String(request.body?.mood || '');
      if (!Object.hasOwn(MOOD_STRESS, mood)) return response.status(400).json({ error: 'Choose one of the available moods.' });
      const entry = { _id: crypto.randomUUID(), userId: request.user._id, mood, stress: MOOD_STRESS[mood], createdAt: new Date().toISOString() };
      await moodEntries.insertOne(entry);
      return response.status(201).json({ entry: publicEntry(entry) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/insights', requireUser, async (request, response, next) => {
    try {
      const today = new Date();
      const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const weekStart = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
      const [weekEntries, latestEntry, diaryCount] = await Promise.all([
        moodEntries.find({ userId: request.user._id, createdAt: { $gte: weekStart.toISOString() } }).sort({ createdAt: 1 }).toArray(),
        moodEntries.find({ userId: request.user._id }).sort({ createdAt: -1 }).limit(1).next(),
        diaryEntries.countDocuments({ userId: request.user._id })
      ]);
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        const dayEntries = weekEntries.filter((entry) => entry.createdAt.slice(0, 10) === key);
        return { date: key, stress: dayEntries.length ? Math.round(dayEntries.reduce((total, entry) => total + entry.stress, 0) / dayEntries.length) : null, count: dayEntries.length };
      });
      const moodCounts = weekEntries.reduce((counts, entry) => ({ ...counts, [entry.mood]: (counts[entry.mood] || 0) + 1 }), {});
      const commonMood = Object.entries(moodCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
      const daysWithCheckIns = days.filter((day) => day.stress !== null);
      const averageStress = daysWithCheckIns.length ? Math.round(daysWithCheckIns.reduce((total, day) => total + day.stress, 0) / daysWithCheckIns.length) : null;
      return response.json({ checkIns: weekEntries.length, daysWithCheckIns: daysWithCheckIns.length, commonMood, latestMood: latestEntry?.mood || null, averageStress, stressGuidance: stressGuidanceFor(averageStress), stressByDay: days, diaryCount });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/signout', async (request, response, next) => {
    try {
      const sessionId = readSessionId(request);
      if (sessionId) await sessions.deleteOne({ _id: sessionId });
      response.set('Set-Cookie', sessionCookie('', 0));
      return response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/', (request, response) => response.sendFile(path.join(ROOT, 'index.html')));
  app.get(['/index.html', '/script.js', '/styles.css'], (request, response) => response.sendFile(path.join(ROOT, request.path.slice(1))));
  app.use('/api', (request, response) => response.status(404).json({ error: 'API route not found.' }));
  app.use((request, response) => response.status(404).json({ error: 'Page not found.' }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof SyntaxError && Object.hasOwn(error, 'body')) return response.status(400).json({ error: 'We could not process that request.' });
    console.error('Request failed:', error.message);
    return response.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

async function start() {
  let database;
  if (process.env.MONGODB_URI) {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    database = client.db(process.env.MONGODB_DB || undefined);
    await Promise.all([
      database.collection('users').createIndex({ email: 1 }, { unique: true }),
      database.collection('diaryEntries').createIndex({ userId: 1, createdAt: -1 }),
      database.collection('moodEntries').createIndex({ userId: 1, createdAt: -1 }),
      database.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('Set MONGODB_URI to your MongoDB connection string before starting in production.');
    database = createLocalDatabase();
    console.warn('MONGODB_URI not set; using local JSON storage for development.');
  }
  await importLegacyFile(USERS_FILE, database.collection('users'));
  await importLegacyFile(DIARY_FILE, database.collection('diaryEntries'));
  createApp(database).listen(PORT, () => console.log(`Well Mind Stress Analyzer is running at http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
