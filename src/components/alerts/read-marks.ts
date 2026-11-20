import { useCallback, useEffect, useState } from "react";
import { markRead, parseMarks, type AlertItem, type ReadMarks } from "./alerts";

/**
 * Where "mark read" is kept: this browser, for now. A shared read state needs a table on the
 * backend; when it exists, only this hook changes.
 */
const STORAGE_KEY = "health.alerts.read.v1";

const load = (): ReadMarks => {
  try {
    return parseMarks(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
};

const save = (marks: ReadMarks) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Storage blocked (private window): marks last until the page reloads.
  }
};

/** The read marks, kept in step across tabs, and a way to mark items read. */
export function useReadMarks() {
  const [marks, setMarks] = useState<ReadMarks>(load);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setMarks(parseMarks(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const mark = useCallback((items: Pick<AlertItem, "key" | "lastAt">[]) => {
    setMarks((current) => {
      const next = markRead(current, items);
      save(next);
      return next;
    });
  }, []);

  return { marks, mark };
}
