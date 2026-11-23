import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A single shareable view-state value backed by the query string.
 *
 * Discrete controls should pass `{ replace: false }` so Back steps through
 * the views a reader chose. Fast-changing fields such as search should keep
 * the default replace behaviour so every keystroke does not fill history.
 */
export function useUrlState(key, fallback, { replace = true } = {}) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw === null || raw === "" ? fallback : raw;

  const update = useCallback(
    (next, options = {}) => {
      setParams(
        (current) => {
          const nextParams = new URLSearchParams(current);
          const resolved =
            typeof next === "function" ? next(nextParams.get(key) ?? fallback) : next;

          if (
            resolved === fallback ||
            resolved === undefined ||
            resolved === null ||
            resolved === ""
          ) {
            nextParams.delete(key);
          } else {
            nextParams.set(key, String(resolved));
          }
          return nextParams;
        },
        { replace: options.replace ?? replace }
      );
    },
    [fallback, key, replace, setParams]
  );

  return [value, update];
}
