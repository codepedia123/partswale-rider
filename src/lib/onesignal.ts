import { Capacitor } from "@capacitor/core";
import NativeOneSignal from "@onesignal/capacitor-plugin";

const FALLBACK_APP_ID = "dda92aea-47cb-4b26-8261-6e60d72f7200";
const FALLBACK_SAFARI_WEB_ID = "web.onesignal.auto.5c44608d-852e-4e28-9501-302895454737";
const SDK_SRC = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const WORKER_PATH = "push/onesignal/OneSignalSDKWorker.js";
const WORKER_SCOPE = "/push/onesignal/";

export type OneSignalSyncState = {
  onesignal_id: string | null;
  external_id: string | null;
  subscription_id: string | null;
  token: string | null;
  opted_in: boolean;
  permission: NotificationPermission | "unsupported";
  last_error?: string | null;
};

type OneSignalChangeEvent = {
  current?: { id?: string | null; token?: string | null; optedIn?: boolean | null };
};

type OneSignalWebInstance = {
  init: (options: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: { isPushSupported: () => boolean };
  User: {
    onesignalId?: string | null;
    externalId?: string | null;
    PushSubscription: {
      id?: string | null;
      token?: string | null;
      optedIn?: boolean;
      optIn: () => Promise<void>;
      addEventListener: (event: "change", listener: (event: OneSignalChangeEvent) => void) => void;
    };
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalWebInstance) => void | Promise<void>>;
  }
}

let scriptPromise: Promise<void> | null = null;
let instancePromise: Promise<OneSignalWebInstance> | null = null;
let observerAttached = false;
let nativeInitialized = false;

function isNativeOneSignalRuntime() {
  return Capacitor.isNativePlatform();
}

function getAppId() {
  return (import.meta.env.VITE_ONESIGNAL_RIDER_APP_ID as string | undefined)?.trim()
    || (import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined)?.trim()
    || FALLBACK_APP_ID;
}

function getSafariWebId() {
  return (import.meta.env.VITE_ONESIGNAL_RIDER_SAFARI_WEB_ID as string | undefined)?.trim()
    || (import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID as string | undefined)?.trim()
    || FALLBACK_SAFARI_WEB_ID;
}

export function canUseOneSignalPush() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (isNativeOneSignalRuntime()) return true;
  const userAgent = String(navigator.userAgent || navigator.vendor || "").toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(userAgent) && "Notification" in window && "serviceWorker" in navigator;
}

async function ensureNativeOneSignal() {
  if (nativeInitialized) return;
  await NativeOneSignal.initialize(getAppId());
  nativeInitialized = true;
}

function ensureSdkScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("OneSignal SDK load failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("OneSignal SDK load failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function getOneSignal() {
  if (instancePromise) return instancePromise;
  instancePromise = (async () => {
    await ensureSdkScript();
    return await new Promise<OneSignalWebInstance>((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (oneSignal) => {
        await oneSignal.init({
          appId: getAppId(),
          safari_web_id: getSafariWebId(),
          notifyButton: { enable: false },
          serviceWorkerPath: WORKER_PATH,
          serviceWorkerParam: { scope: WORKER_SCOPE },
          autoResubscribe: true,
        });
        resolve(oneSignal);
      });
    });
  })();
  return instancePromise;
}

async function readNativeState(lastError?: string | null): Promise<OneSignalSyncState> {
  await ensureNativeOneSignal();
  const [onesignalId, externalId, subscriptionId, token, optedIn, hasPermission, canRequestPermission] = await Promise.all([
    NativeOneSignal.User.getOnesignalId(),
    NativeOneSignal.User.getExternalId(),
    NativeOneSignal.User.pushSubscription.getIdAsync(),
    NativeOneSignal.User.pushSubscription.getTokenAsync(),
    NativeOneSignal.User.pushSubscription.getOptedInAsync(),
    NativeOneSignal.Notifications.hasPermission(),
    NativeOneSignal.Notifications.canRequestPermission(),
  ]);
  const permission: NotificationPermission = hasPermission ? "granted" : canRequestPermission ? "default" : "denied";
  return {
    onesignal_id: onesignalId || null,
    external_id: externalId || null,
    subscription_id: subscriptionId || null,
    token: token || null,
    opted_in: Boolean(optedIn),
    permission,
    last_error: lastError || null,
  };
}

async function readWebState(oneSignal: OneSignalWebInstance, lastError?: string | null): Promise<OneSignalSyncState> {
  const supported = oneSignal.Notifications.isPushSupported();
  return {
    onesignal_id: oneSignal.User.onesignalId || null,
    external_id: oneSignal.User.externalId || null,
    subscription_id: oneSignal.User.PushSubscription.id || null,
    token: oneSignal.User.PushSubscription.token || null,
    opted_in: Boolean(oneSignal.User.PushSubscription.optedIn),
    permission: supported ? Notification.permission : "unsupported",
    last_error: lastError || null,
  };
}

export async function getOneSignalPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!canUseOneSignalPush()) return "unsupported";
  if (isNativeOneSignalRuntime()) {
    return (await readNativeState()).permission;
  }
  return Notification.permission;
}

export async function ensureRiderOneSignalUser(args: {
  externalId: string;
  syncState: (state: OneSignalSyncState) => Promise<unknown>;
}) {
  if (!canUseOneSignalPush()) return { supported: false as const, state: null };

  if (isNativeOneSignalRuntime()) {
    await ensureNativeOneSignal();
    await NativeOneSignal.login(args.externalId);
    if (!observerAttached) {
      observerAttached = true;
      NativeOneSignal.User.pushSubscription.addEventListener("change", async () => {
        try {
          await NativeOneSignal.login(args.externalId);
          await args.syncState(await readNativeState());
        } catch {
          // Ignore observer failures.
        }
      });
    }
    const state = await readNativeState();
    await args.syncState(state);
    return { supported: true as const, state };
  }

  const oneSignal = await getOneSignal();
  await oneSignal.login(args.externalId);
  if (!observerAttached) {
    observerAttached = true;
    oneSignal.User.PushSubscription.addEventListener("change", async () => {
      try {
        await oneSignal.login(args.externalId);
        await args.syncState(await readWebState(oneSignal));
      } catch {
        // Ignore observer failures.
      }
    });
  }
  const state = await readWebState(oneSignal);
  await args.syncState(state);
  return { supported: true as const, state };
}

export async function promptRiderOneSignal(args: {
  externalId: string;
  syncState: (state: OneSignalSyncState) => Promise<unknown>;
}) {
  const ensured = await ensureRiderOneSignalUser(args);
  if (!ensured.supported) return ensured;

  if (isNativeOneSignalRuntime()) {
    await NativeOneSignal.Notifications.requestPermission(true);
    await NativeOneSignal.User.pushSubscription.optIn();
    const state = await readNativeState();
    await args.syncState(state);
    return { supported: true as const, state };
  }

  const oneSignal = await getOneSignal();
  await oneSignal.User.PushSubscription.optIn();
  const state = await readWebState(oneSignal);
  await args.syncState(state);
  return { supported: true as const, state };
}

export async function logoutRiderOneSignal() {
  if (!canUseOneSignalPush()) return;
  if (isNativeOneSignalRuntime()) {
    await ensureNativeOneSignal();
    await NativeOneSignal.logout();
    return;
  }
  const oneSignal = await getOneSignal();
  await oneSignal.logout();
}
