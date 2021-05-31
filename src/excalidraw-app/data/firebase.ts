import { getImportedKey } from "../data";
import { createIV } from "./index";
import { ExcalidrawElement } from "../../element/types";
import { getSceneVersion } from "../../element";
import Portal from "../collab/Portal";
import { restoreElements } from "../../data/restore";
import KintoClient from "kinto-http";

let kintoClient: typeof KintoClient | null = null;

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

const loadClient = (): typeof KintoClient => {
  const url = process.env.REACT_APP_STORE_BACKEND_URL;
  const client = new KintoClient(url);
  // @ts-ignore
  return client;
};

const getClient = (): typeof KintoClient => {
  if (!kintoClient) {
    kintoClient = loadClient();
  }
  return kintoClient;
};

const getStore = () => {
  const client = getClient();
  // @ts-ignore
  return client.bucket("whiteboard").collection("scenes");
};

interface FirebaseStoredScene {
  sceneVersion: number;
  iv: string; // base64
  ciphertext: string; // base64
}

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
    id: roomId,
    sceneVersion,
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    iv: uint8ArrayToBase64(iv),
  } as FirebaseStoredScene;

  const store = getStore();
  const runTransaction = async () => {
    let doc;
    let docExists = true;
    try {
      doc = await store.getRecord(roomId);
    } catch (e) {
      if (e.message && e.message.indexOf("404") > -1) {
        docExists = false;
      } else {
        console.error(e);
        return false;
      }
    }
    if (!docExists) {
      await store.createRecord(nextDocData);
      return true;
    }

    const prevDocData = doc.data as FirebaseStoredScene;
    if (prevDocData.sceneVersion >= nextDocData.sceneVersion) {
      return false;
    }

    await store.updateRecord(nextDocData);
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
    doc = await store.getRecord(roomId);
  } catch (e) {
    if (e.message && e.message.indexOf("404") > -1) {
      docExists = false;
    } else {
      console.error(e);
      return null;
    }
  }
  if (!docExists) {
    return null;
  }

  const storedScene = doc.data as FirebaseStoredScene;
  const ciphertext = base64ToUint8Array(storedScene.ciphertext);
  const iv = base64ToUint8Array(storedScene.iv);
  const elements = await decryptElements(roomKey, iv, ciphertext);

  if (socket) {
    firebaseSceneVersionCache.set(socket, getSceneVersion(elements));
  }

  return restoreElements(elements);
};
