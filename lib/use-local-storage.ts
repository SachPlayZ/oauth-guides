"use client";

import { useCallback, useSyncExternalStore } from "react";

// A localStorage string that survives reloads; empty on the server and when storage is blocked.

const EVENT = "runway:storage";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

export function useLocalStorage(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key), () => "");
  const set = useCallback(
    (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
