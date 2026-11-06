// Week 11 (Part A): a stand-in partner you can point CampusHub's server at.
// Run: node server/flaky-partner.js   (needs Node 18+, and Express installed)
// It is a separate little program — not part of the CampusHub project.
//
// Four modes you can switch WITHOUT restarting (the handout's /__mode route):
//   curl http://localhost:4000/__mode/slow     -> answers after 10 s
//   curl http://localhost:4000/__mode/flaky    -> fails twice, then works
//   curl http://localhost:4000/__mode/error    -> always 500
//   curl http://localhost:4000/__mode/ok       -> back to normal
//
// The response shapes mirror Team 6's AgroConnect contract so CampusHub's
// routes (/api/partner/*) speak to something that looks like them.

import express from "express";

const app = express();
const PORT = 4000;

app.use(express.json());

let mode = "ok"; // ok | slow | flaky | error
let calls = { farmers: 0, farmersId: 0, produce: 0 };

let counter = 0;
const bump = () => ++counter % 3;

const FARMERS = [{ id: 1, fullName: "Test Farmer", county: "Nairobi", focus: "Dairy" }];
const FARMER = { ...FARMERS[0], phone: "+254700000000", createdAt: "2026-10-01T00:00:00Z" };
const PRODUCE = [
  {
    id: 1,
    title: "Fresh milk",
    category: "dairy",
    price: 120,
    unit: "litre",
    quantity: 40,
    county: "Nairobi",
    sellerName: "Test Farmer",
    availableFrom: "2026-11-05",
  },
];

app.get("/__mode/:m", (req, res) => {
  mode = req.params.m;
  calls = { farmers: 0, farmersId: 0, produce: 0 };
  res.json({ mode });
});

app.get("/farmers", async (req, res) => {
  calls.farmers += 1;
  console.log(`GET /farmers (call ${calls.farmers}, mode ${mode})`);

  if (mode === "slow") await new Promise((r) => setTimeout(r, 10000)); // answers after 10 s
  if (mode === "flaky" && bump() !== 0) return res.status(503).json({ message: "Try again" });
  if (mode === "error") return res.status(500).json({ message: "Internal error" });

  res.json({ farmers: FARMERS });
});

app.get("/farmers/:id", async (req, res) => {
  calls.farmersId += 1;
  console.log(`GET /farmers/${req.params.id} (call ${calls.farmersId}, mode ${mode})`);

  if (mode === "slow") await new Promise((r) => setTimeout(r, 10000));
  if (mode === "flaky" && bump() !== 0) return res.status(503).json({ message: "Try again" });
  if (mode === "error") return res.status(500).json({ message: "Internal error" });
  if (Number(req.params.id) !== 1) return res.status(404).json({ message: "Not found" });

  res.json({ farmer: FARMER });
});

app.get("/produce", async (req, res) => {
  calls.produce += 1;
  console.log(`GET /produce (call ${calls.produce}, mode ${mode})`);

  if (mode === "slow") await new Promise((r) => setTimeout(r, 10000));
  if (mode === "flaky" && bump() !== 0) return res.status(503).json({ message: "Try again" });
  if (mode === "error") return res.status(500).json({ message: "Internal error" });

  res.json({ listings: PRODUCE });
});

app.post("/auth/login", async (req, res) => {
  if (mode === "slow") await new Promise((r) => setTimeout(r, 10000));
  if (mode === "error") return res.status(500).json({ message: "Internal error" });
  res.json({ token: "fake-partner-token" });
});

app.post("/orders", async (req, res) => {
  if (mode === "slow") await new Promise((r) => setTimeout(r, 10000));
  if (mode === "error") return res.status(500).json({ message: "Internal error" });
  res.status(201).json({ order: { id: 1, total: 120, status: "placed" } });
});

app.listen(PORT, () => {
  console.log(
    `Fake partner running at http://localhost:${PORT} — switch modes: curl http://localhost:${PORT}/__mode/ok|slow|flaky|error`
  );
});
