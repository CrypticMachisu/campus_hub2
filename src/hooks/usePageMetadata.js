import { useEffect } from "react";

const SITE_NAME = "Kesho";
const DEFAULT_TITLE = "Kesho — This week on campus";
const DEFAULT_DESCRIPTION =
  "Find clubs and events across your campus, RSVP, and keep every commitment in one place.";

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

/**
 * Set the tab title, description, and basic social preview copy for a route.
 * Pages call this with their own copy; the default is the public edition.
 */
export function usePageMetadata({ title, description, type = "website" } = {}) {
  useEffect(() => {
    const pageTitle = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE;
    const plainDescription = String(description || DEFAULT_DESCRIPTION)
      .replace(/\s+/g, " ")
      .trim();
    const pageDescription =
      plainDescription.length > 160 ? `${plainDescription.slice(0, 157)}…` : plainDescription;

    document.title = pageTitle;
    setMeta("name", "description", pageDescription);
    setMeta("property", "og:title", pageTitle);
    setMeta("property", "og:description", pageDescription);
    setMeta("property", "og:type", type);
  }, [title, description, type]);
}
