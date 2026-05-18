const { EventEmitter } = require('events');
const PassSlip = require('../models/PassSlip');
const TravelOrder = require('../models/TravelOrder');
const User = require('../models/User');

const hub = new EventEmitter();
hub.setMaxListeners(0);

const OPERATION_TYPES = ['insert', 'update', 'replace', 'delete'];
const RESTART_DELAY_MS = 3000;

let passSlipStream = null;
let travelOrderStream = null;
let userStream = null;
let subscriberCount = 0;
let streamsActive = false;

/** @type {Map<string, { res: import('http').ServerResponse, userId: string, role: string }>} */
const sseClients = new Map();

function normalizeChange(collection, change) {
  const documentId = change.documentKey?._id?.toString() ?? null;
  return {
    collection,
    operationType: change.operationType,
    documentId,
  };
}

function notificationsFieldUpdated(change) {
  const fields = change.updateDescription?.updatedFields;
  if (!fields || typeof fields !== 'object') return false;
  return Object.keys(fields).some(
    (key) => key === 'notifications' || key.startsWith('notifications.')
  );
}

function broadcastToSseClients(event) {
  const payload = JSON.stringify(event);
  const chunk = `data: ${payload}\n\n`;

  for (const [id, client] of sseClients) {
    if (!shouldSendToClient(client, event)) continue;
    try {
      if (!client.res.writableEnded) {
        client.res.write(chunk);
      }
    } catch (err) {
      console.error(`SSE write failed for client ${id}:`, err.message);
      removeSseClient(id);
    }
  }
}

function shouldSendToClient(client, event) {
  if (event.collection === 'users' && event.userId) {
    return String(client.userId) === String(event.userId);
  }
  return true;
}

hub.on('change', broadcastToSseClients);

async function closeStream(streamRef) {
  if (!streamRef) return null;
  try {
    await streamRef.close();
  } catch (err) {
    console.error('Error closing change stream:', err.message);
  }
  return null;
}

async function stopChangeStreams() {
  passSlipStream = await closeStream(passSlipStream);
  travelOrderStream = await closeStream(travelOrderStream);
  userStream = await closeStream(userStream);
  streamsActive = false;
  console.log('MongoDB change streams stopped (no SSE subscribers)');
}

function scheduleRestart(collection, opener) {
  if (subscriberCount <= 0) return;
  setTimeout(() => {
    if (subscriberCount > 0) {
      console.log(`Restarting change stream for ${collection}...`);
      opener();
    }
  }, RESTART_DELAY_MS);
}

function watchCollection(Model, collectionName, onChange) {
  const pipeline = [{ $match: { operationType: { $in: OPERATION_TYPES } } }];
  const stream = Model.watch(pipeline, { fullDocument: 'whenAvailable' });

  stream.on('change', (change) => {
    try {
      onChange(change);
    } catch (err) {
      console.error(`Change handler error (${collectionName}):`, err);
    }
  });

  stream.on('error', (err) => {
    console.error(`Change stream error (${collectionName}):`, err.message);
    if (collectionName === 'passSlips') {
      passSlipStream = null;
      scheduleRestart(collectionName, startPassSlipStream);
    } else if (collectionName === 'travelOrders') {
      travelOrderStream = null;
      scheduleRestart(collectionName, startTravelOrderStream);
    } else if (collectionName === 'users') {
      userStream = null;
      scheduleRestart(collectionName, startUserStream);
    }
  });

  stream.on('close', () => {
    if (subscriberCount > 0 && streamsActive) {
      console.warn(`Change stream closed (${collectionName}), scheduling restart`);
      if (collectionName === 'passSlips') passSlipStream = null;
      if (collectionName === 'travelOrders') travelOrderStream = null;
      if (collectionName === 'users') userStream = null;
      scheduleRestart(collectionName, () => {
        if (collectionName === 'passSlips') startPassSlipStream();
        if (collectionName === 'travelOrders') startTravelOrderStream();
        if (collectionName === 'users') startUserStream();
      });
    }
  });

  return stream;
}

function startPassSlipStream() {
  if (passSlipStream) return;
  passSlipStream = watchCollection(PassSlip, 'passSlips', (change) => {
    hub.emit('change', normalizeChange('passSlips', change));
  });
  console.log('PassSlip change stream started');
}

function startTravelOrderStream() {
  if (travelOrderStream) return;
  travelOrderStream = watchCollection(TravelOrder, 'travelOrders', (change) => {
    hub.emit('change', normalizeChange('travelOrders', change));
  });
  console.log('TravelOrder change stream started');
}

function startUserStream() {
  if (userStream) return;
  userStream = watchCollection(User, 'users', (change) => {
    if (!notificationsFieldUpdated(change)) return;
    const userId = change.documentKey?._id?.toString();
    if (!userId) return;
    hub.emit('change', {
      collection: 'users',
      operationType: 'notification',
      documentId: userId,
      userId,
    });
  });
  console.log('User notifications change stream started');
}

async function startChangeStreams() {
  if (streamsActive) return;
  streamsActive = true;
  startPassSlipStream();
  startTravelOrderStream();
  startUserStream();
  console.log('MongoDB change streams active');
}

function ensureStreamsForSubscribers() {
  if (subscriberCount > 0 && !streamsActive) {
    void startChangeStreams();
  }
}

function addSseClient(id, client) {
  sseClients.set(id, client);
  subscriberCount += 1;
  ensureStreamsForSubscribers();
}

function removeSseClient(id) {
  if (!sseClients.has(id)) return;
  sseClients.delete(id);
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0) {
    void stopChangeStreams();
  }
}

function getSseSubscriberCount() {
  return sseClients.size;
}

module.exports = {
  hub,
  addSseClient,
  removeSseClient,
  getSseSubscriberCount,
  startChangeStreams,
  stopChangeStreams,
};
