import express from "express";

const app = express();
const PORT = 4000;

app.use(express.json());

let flakyAttempts = 0;

app.get("/farmers", async (req, res) => {
  const mode = req.query.mode || "ok";

  console.log(`Request received: mode=${mode}`);

  if (mode === "ok") {
    return res.json({
      farmers: [
        { id: 1, fullName: "Test Farmer", county: "Nairobi" }
      ]
    });
  }

  if (mode === "slow") {
    await new Promise(resolve => setTimeout(resolve, 10000));

    return res.json({
      farmers: [{ id: 1, fullName: "Slow Farmer" }]
    });
  }

  if (mode === "flaky") {
    flakyAttempts++;

    if (flakyAttempts <= 2) {
      return res.status(503).json({
        message: "Service temporarily unavailable"
      });
    }

    return res.json({
      farmers: [{ id: 1, fullName: "Recovered Farmer" }]
    });
  }

  if (mode === "error") {
    return res.status(500).json({
      message: "Internal server error"
    });
  }

  return res.status(400).json({
    message: "Unknown mode"
  });
});

app.listen(PORT, () => {
  console.log(`Fake partner running at http://localhost:${PORT}`);
});