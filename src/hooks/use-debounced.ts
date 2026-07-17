import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delayMs`. Use to keep a text input
 * responsive while avoiding a request per keystroke.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
