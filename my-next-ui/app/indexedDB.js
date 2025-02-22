import { openDB } from "idb";

const DB_NAME = "AudioCacheDB";
const STORE_NAME = "AudioStore";

// Open IndexedDB database
const openDatabase = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
};

// Store audio file in IndexedDB
export const storeAudioInDB = async (textId, audioBlob) => {
  const db = await openDatabase();
  await db.put(STORE_NAME, audioBlob, textId);
};

// Retrieve audio file from IndexedDB
export const getAudioFromDB = async (textId) => {
  const db = await openDatabase();
  return db.get(STORE_NAME, textId);
};

