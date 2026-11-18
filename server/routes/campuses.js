// Campus directory. Phase 4 only exposes the list; the switcher stays with
// tier 1 until cross-campus discovery is designed.
import { listCampuses } from "../campus.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const campusesRouter = createApiRouter();

campusesRouter.get("/", async (req, res) => {
  res.json({ campuses: await listCampuses() });
});
