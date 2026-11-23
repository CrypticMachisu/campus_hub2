import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Guards an unsaved draft against accidental navigation.
 *
 * Internal links are intercepted before React Router handles them; external
 * navigation and tab closure use the browser's beforeunload prompt. The draft
 * itself stays untouched until the reader confirms they want to leave.
 */
export default function useUnsavedChanges(
  when,
  message = "You have an unsaved draft. Leave this page and discard it?"
) {
  const navigate = useNavigate();
  const whenRef = useRef(when);
  const messageRef = useRef(message);
  const bypassRef = useRef(false);

  whenRef.current = when;
  messageRef.current = message;

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!whenRef.current) return undefined;
      event.preventDefault();
      event.returnValue = messageRef.current;
      return messageRef.current;
    }

    function handleClick(event) {
      if (!whenRef.current || bypassRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.dataset.skipUnsavedGuard !== undefined) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!window.confirm(messageRef.current)) return;

      bypassRef.current = true;
      navigate(`${url.pathname}${url.search}${url.hash}`);
      window.setTimeout(() => {
        bypassRef.current = false;
      }, 0);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [navigate]);
}
