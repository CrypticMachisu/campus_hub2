// Week 13 (Part C): the standard "this is going away" headers.
//
// A deprecation notice is not enough on its own — the caller who reads it once
// and forgets still needs to find out from the API itself. These headers ride
// on every v1 response: Deprecation says it is deprecated, Sunset says the day
// it stops working, Link points at the replacement. They are only mounted on
// v1; v2 must never carry them (see __tests__/versions.test.js).

/**
 * @param {{ sunset: string, successor: string }} options
 *   sunset    date (or timestamp) after which the old version may be removed
 *   successor the path that replaces these routes
 */
export function deprecated({ sunset, successor }) {
  // Formatted once at startup: every response carries the same promise, and
  // the value cannot drift from the date written in DEPRECATION_NOTICE.md.
  const when = new Date(sunset).toUTCString();

  return (req, res, next) => {
    res.set("Deprecation", "true");
    res.set("Sunset", when);
    res.set("Link", `<${successor}>; rel="successor-version"`);
    next();
  };
}
