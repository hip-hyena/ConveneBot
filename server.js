const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') });

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./db.sqlite3');
const app = express();
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

['run', 'all', 'get', 'exec'].forEach(fnName => {
  db[fnName + 'Async'] = (sql, ...params) => {
    return new Promise((resolve, reject) => {
      db[fnName](sql, ...params, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }
});

db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT, username TEXT, language_code TEXT, is_active INT NOT NULL DEFAULT 1);

  CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, owner_id INT NOT NULL, state INT NOT NULL DEFAULT 0, title TEXT, description TEXT, dates TEXT, latitude REAL, longitude REAL, location TEXT, starts_at TIMESTAMP, ends_at TIMESTAMP, has_image INT NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS events_owner_id ON events (owner_id);

  CREATE TABLE IF NOT EXISTS events_users (event_id TEXT NOT NULL, user_id INT NOT NULL, state INT NOT NULL DEFAULT 0, dates TEXT, role TEXT, comment TEXT, PRIMARY KEY (event_id, user_id));
`);

function randomId() {
  const bytes = crypto.randomBytes(12);
  return btoa(String.fromCharCode.apply(null, bytes)).replace(/\//g, '_').replace(/\+/g, '-');
}

function validateInitData(initData) {
  const data = {};
  const raw = {};
  let hash;
  for (let line of initData.split('&')) {
    const pair = line.split('=');
    if (pair.length == 2) {
      const key = decodeURIComponent(pair[0]);
      const value = decodeURIComponent(pair[1]);
      if (key == 'hash') {
        hash = value;
      } else {
        raw[key] = value;
        data[key] = (key == 'user') ? JSON.parse(value) : value;
      }
    }
  }
  const keys = Object.keys(data);
  keys.sort();

  const list = [];
  for (let key of keys) {
    list.push(`${key}=${raw[key]}`);
  }
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_TOKEN).digest();
  const correctHash = crypto.createHmac('sha256', secretKey).update(list.join('\n')).digest('hex');
  
  if (correctHash != hash) {
    return null;
  }
  return data;
}

async function processStart(msg) {
  if (msg.chat.type != 'private') {
    return;
  }

  const chatId = msg.chat.id;
  const me = msg.from;
  await db.runAsync('INSERT INTO users (id, first_name, last_name, username, language_code, is_active) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, username=excluded.username, language_code=excluded.language_code, is_active=excluded.is_active', me.id, me.first_name, me.last_name, me.username, me.language_code);
  
  bot.sendMessage(chatId, `This bot will help you plan an event with your friends. Start by selecting one of your chats, and typing the name of new event.`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Select Group or Channel...',
        switch_inline_query: '',
      }]],
    }
  });
}

bot.on('my_chat_member', async (msg) => {
  if (msg.chat.type != 'private') {
    return;
  }
  const isActive = msg.new_chat_member.status == 'member';
  const me = msg.from;
  await db.runAsync('INSERT INTO users (id, first_name, last_name, username, language_code, is_active) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, username=excluded.username, language_code=excluded.language_code, is_active=excluded.is_active', me.id, me.first_name, me.last_name, me.username, me.language_code, isActive);
});
bot.on('message', async (msg) => {
  if (msg.write_access_allowed) { // If user allowed writing when opened app, it won't cause '/start'.
    processStart(msg);
  }
});
bot.onText(/^\/start$/, processStart);

bot.on('inline_query', async query => {
  const offs = query.offset ? parseInt(query.offset) : 0;
  const events = await db.allAsync('SELECT * FROM events WHERE owner_id = ? AND state > -1 ORDER BY created_at DESC LIMIT ?, 21', query.from.id, offs);

  const id = randomId();
  const title = query.query == '-' ? '' : query.query;
  db.run('INSERT INTO events (id, title, owner_id, dates, state) VALUES (?, ?, ?, ?, -1)', id, title || null, query.from.id, JSON.stringify({}));
  bot.answerInlineQuery(query.id, [{
    type: 'article',
    id: randomId(),
    title: `New Event${title ? ' "' + title + '"' : ''}`,
    description: 'Create new event',
    thumbnail_url: `${process.env.MINIAPP_HOST}/calendar-icon.png`,
    thumbnail_width: 256,
    thumbnail_height: 256,
    input_message_content: {
      message_text: title ?
        `Event "<a href="https://t.me/${process.env.TELEGRAM_USERNAME}/event?startapp=${id}">${title}</a>"` :
        `<a href="https://t.me/${process.env.TELEGRAM_USERNAME}/event?startapp=${id}">Event</a>`,
      parse_mode: 'HTML',
    },
  }].concat(events.slice(0, 20).map(event => {
    return {
      type: 'article',
      id: event.id,
      title: event.title ? `Event "${event.title}"` : 'Untitled Event',
      description: event.description || '',
      thumbnail_url: event.has_image ? `${process.env.MINIAPP_HOST}/images/${event.id}.jpg` : `${process.env.MINIAPP_HOST}/calendar-icon.png`,
      thumbnail_width: 256,
      thumbnail_height: 256,
      input_message_content: {
        message_text: title ?
          `Event "<a href="https://t.me/${process.env.TELEGRAM_USERNAME}/event?startapp=${event.id}">${event.title}</a>"` :
          `<a href="https://t.me/${process.env.TELEGRAM_USERNAME}/event?startapp=${event.id}">Event</a>`,
        parse_mode: 'HTML',
      },
    }
  })), {
    is_personal: true,
    cache_time: 5,
    next_offset: events.length == 21 ? offs + 20 : '',
  });
});

app.use(express.json());

app.post('/join', async (req, res) => {
  const id = req.body.id;
  const initData = validateInitData(req.body.initData);
  if (!initData) {
    res.json({ error: 'Invalid initData' });
    return;
  }
  const me = initData.user;

  const event = await db.getAsync('SELECT * FROM events WHERE id = ?', id);
  if (!event) {
    res.json({ error: 'Event not found' });
    return;
  }

  const state = req.body.state;
  const dates = req.body.dates || {};

  db.runAsync('INSERT INTO events_users (event_id, user_id, state, dates) VALUES (?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO UPDATE SET state=excluded.state, dates=excluded.dates', id, me.id, state, JSON.stringify(dates));
  
  res.json({ ok: true });
});

app.post('/event', async (req, res) => {
  const id = req.body.id;
  const initData = validateInitData(req.body.initData);
  if (!initData) {
    res.json({ error: 'Invalid initData' });
    return;
  }
  const me = initData.user;

  const event = await db.getAsync('SELECT * FROM events WHERE id = ?', id);
  if (!event) {
    res.json({ error: 'Event not found' });
    return;
  }

  if (event.state == -1) {
    event.state = 0;
    db.runAsync('UPDATE events SET state = 0 WHERE id = ?', id);
    db.runAsync('INSERT OR IGNORE INTO events_users (event_id, user_id, state) VALUES (?, ?, ?)', id, me.id, 1);
  }

  if (req.body.event) {
    if (event.owner_id != me.id) {
      res.json({ error: 'You are not the owner of this event' });
      return;
    }

    const newEvent = req.body.event;
    await db.runAsync('UPDATE events SET state = ?, title = ?, description = ?, dates = ?, latitude = ?, longitude = ?, location = ?, starts_at = ?, ends_at = ?, has_image = ? WHERE id = ?',
      newEvent.state,
      newEvent.title,
      newEvent.description,
      newEvent.dates ? JSON.stringify(newEvent.dates) : null,
      newEvent.coords ? newEvent.coords.latitude : null,
      newEvent.coords ? newEvent.coords.longitude : null,
      newEvent.location,
      newEvent.starts_at,
      newEvent.ends_at,
      newEvent.has_image,
      id);
  }

  const participants = await db.allAsync('SELECT * FROM events_users LEFT JOIN users ON events_users.user_id = users.id WHERE event_id = ?', id);

  res.json({
    state: event.state,
    owner_id: event.owner_id,
    title: event.title || null,
    description: event.description || null,
    dates: event.dates ? JSON.parse(event.dates) : null,
    coords: event.longitude && event.latitude ? {
      longitude: event.longitude,
      latitude: event.latitude,
    } : null,
    location: event.location || null,
    starts_at: event.starts_at || null,
    ends_at: event.ends_at || null,
    has_image: !!event.has_image,

    participants: participants.map(user => {
      return {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        is_active: user.is_active,
        state: user.state,
        dates: user.dates ? JSON.parse(user.dates) : null,
        role: user.role,
        comment: user.comment,
      }
    })
  });
});

app.use(express.static('static'));
app.listen(process.env.MINIAPP_PORT, () => {
  console.log(`@${process.env.TELEGRAM_USERNAME} listening on port ${process.env.MINIAPP_PORT}`);
});