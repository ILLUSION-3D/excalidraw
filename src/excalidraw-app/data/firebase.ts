import { getImportedKey } from "../data";
import { createIV } from "./index";
import { ExcalidrawElement } from "../../element/types";
import { getSceneVersion } from "../../element";
import Portal from "../collab/Portal";
import { restoreElements } from "../../data/restore";

// https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/btoa
// https://github.com/MrPropre/base64-u8array-arraybuffer/blob/master/src/index.js

const uint8ArrayToBase64 = (typedArray: Uint8Array) => {
  const string = typedArray.reduce((data, byte) => {
    return data + String.fromCharCode(byte);
  }, "");
  return btoa(string);
};

const base64ToUint8Array = (b64: string) =>
  Uint8Array.from(atob(b64), (char: string) => char.charCodeAt(0));

interface FirebaseStoredScene {
  sceneVersion: number;
  iv: string; // base64
  ciphertext: string; // base64
}

const url = process.env.REACT_APP_STORE_BACKEND_URL;
const store = {
  get: async (id: string) => {
    const response = await fetch(`${url}/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (response.status === 404) {
      return null;
    }
    const json = await response.json();
    return json.data;
  },
  create: async (id: string, doc: FirebaseStoredScene) => {
    const whiteboard = { id, data: doc };
    const response = await fetch(`${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(whiteboard),
    });
    return response.json();
  },
  update: async (id: string, doc: FirebaseStoredScene) => {
    const whiteboard = { id, data: doc };
    const response = await fetch(`${url}/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(whiteboard),
    });
    return response.json();
  },
};

const getStore = () => {
  return store;
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const importedKey = await getImportedKey(key, "encrypt");
  const iv = createIV();
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    importedKey,
    encoded,
  );

  return { ciphertext, iv };
};

const decryptElements = async (
  key: string,
  iv: Uint8Array,
  ciphertext: ArrayBuffer,
): Promise<readonly ExcalidrawElement[]> => {
  const importedKey = await getImportedKey(key, "decrypt");
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    importedKey,
    ciphertext,
  );

  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted) as any,
  );
  return JSON.parse(decodedData);
};

const firebaseSceneVersionCache = new WeakMap<SocketIOClient.Socket, number>();

export const isSavedToFirebase = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);
    return firebaseSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveToFirebase = async (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
) => {
  const { roomId, roomKey, socket } = portal;
  if (
    // if no room exists, consider the room saved because there's nothing we can
    // do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSavedToFirebase(portal, elements)
  ) {
    return true;
  }

  const sceneVersion = getSceneVersion(elements);
  const { ciphertext, iv } = await encryptElements(roomKey, elements);
  const nextDocData = {
    sceneVersion,
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    iv: uint8ArrayToBase64(iv),
  } as FirebaseStoredScene;

  const store = getStore();
  const runTransaction = async () => {
    let doc;
    let docExists = true;
    try {
      doc = await store.get(roomId);
      docExists = !!doc;
    } catch (e) {
      console.error(e);
      return false;
    }
    if (!docExists) {
      await store.create(roomId, nextDocData);
      return true;
    }

    const prevDocData = doc.data as FirebaseStoredScene;
    if (
      prevDocData !== null &&
      prevDocData.sceneVersion >= nextDocData.sceneVersion
    ) {
      return false;
    }

    await store.update(roomId, nextDocData);
    return true;
  };
  const didUpdate = await runTransaction();

  if (didUpdate) {
    firebaseSceneVersionCache.set(socket, sceneVersion);
  }

  return didUpdate;
};

export const loadFromFirebase = async (
  roomId: string,
  roomKey: string,
  socket: SocketIOClient.Socket | null,
): Promise<readonly ExcalidrawElement[] | null> => {
  const store = getStore();
  let doc;
  let docExists = true;
  try {
    doc = await store.get(roomId);
    docExists = !!doc;
  } catch (e) {
    console.error(e);
    return null;
  }
  if (!docExists) {
    return null;
  }

  const storedScene = doc.data as FirebaseStoredScene;
  if (storedScene === null) {
    return null;
  }
  const ciphertext = base64ToUint8Array(storedScene.ciphertext);
  const iv = base64ToUint8Array(storedScene.iv);
  const elements = await decryptElements(roomKey, iv, ciphertext);

  if (socket) {
    firebaseSceneVersionCache.set(socket, getSceneVersion(elements));
  }

  return restoreElements(elements);
};
