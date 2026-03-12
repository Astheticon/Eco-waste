const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

/* --------------------
   DEMO DATABASE
-------------------- */

let bins = [
  { id: 1, type: "Recyclable", fillLevel: 20 },
  { id: 2, type: "Organic", fillLevel: 55 },
  { id: 3, type: "General Waste", fillLevel: 80 }
];

/* --------------------
   GET BINS
-------------------- */

app.get("/api/bins", (req, res) => {
  res.json(bins);
});

/* --------------------
   PICKUP REQUEST
-------------------- */

app.post("/api/pickup", (req, res) => {

  const { binId } = req.body;

  const bin = bins.find(b => b.id === binId);

  if (!bin) {
    return res.status(404).json({ error: "Bin not found" });
  }

  bin.fillLevel = 0;

  res.json({
    message: "Pickup scheduled",
    bin
  });

});

/* --------------------
   SERVER START
-------------------- */

app.listen(PORT, () => {
  console.log(`EcoWaste backend running at http://localhost:${PORT}`);
});