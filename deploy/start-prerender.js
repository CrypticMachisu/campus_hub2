import { createPrerenderServer } from "./prerender-server.js";

const port = Number(process.env.PORT || 3000);

createPrerenderServer()
  .then((server) => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`Prerender gateway listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Could not start the prerender gateway:", error.message);
    process.exit(1);
  });
