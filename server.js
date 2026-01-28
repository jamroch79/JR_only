import express from "express";
import fetch from "node-fetch";
import ics from "ics";
import { JSDOM } from "jsdom";

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/jr.ics", async (req, res) => {
  try {
    const url =
      "https://intranet.radiologie-lyon.com/fichiers/document/2577_planning_medecins.htm";

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).send("Erreur lors de la récupération du planning");
    }

    const html = await response.text();

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const rows = Array.from(document.querySelectorAll("tr"));
    const events = [];

    const SALLES = [
      "RADIO MERMOZ",
      "ANGIO",
      "SCANNER1",
      "SCANNER2",
      "SCANNER3",
      "MAMMO",
      "IRM1",
      "IRM2",
      "IRM3",
      "SANTY",
      "ST PRIEST",
      "GERLAND",
      "ADMIN",
      "OFF",
      "VACANCES",
      "ABSENCES TP"
    ];

    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
        td.textContent.trim()
      );

      if (cells.length < 35) continue;

      const dateFR = cells[1];
      if (!dateFR) continue;

      const [d, m, y] = dateFR.split("/");
      const date = [parseInt(y), parseInt(m), parseInt(d)];

      let index = 2;
      let matinSalle = "";
      let amSalle = "";
      let soir = cells[34] || "";

      for (const salle of SALLES) {
        const matin = cells[index] || "";
        const am = cells[index + 1] || "";

        if (matin.split(/\s+/).includes("JR")) matinSalle = salle;
        if (am.split(/\s+/).includes("JR")) amSalle = salle;

        index += 2;
      }

      if (matinSalle) {
        events.push({
          title: `JR — Matin — ${matinSalle}`,
          start: [...date, 8, 0],
          end: [...date, 13, 0]
        });
      }

      if (amSalle) {
        events.push({
          title: `JR — Après‑midi — ${amSalle}`,
          start: [...date, 13, 0],
          end: [...date, 19, 0]
        });
      }

      if (soir.split(/\s+/).includes("JR")) {
        events.push({
          title: `JR — Astreinte du soir`,
          start: [...date, 19, 0],
          end: [...date, 21, 0]
        });
      }
    }

    ics.createEvents(
      events,
      { tzid: "Europe/Paris" },
      (error, value) => {
        if (error) {
          console.error(error);
          return res.status(500).send("Erreur ICS");
        }

        res.setHeader("Content-Type", "text/calendar");
        res.send(value);
      }
    );

  } catch (error) {
    console.error("Erreur ICS :", error);
    res.status(500).send("Erreur interne du serveur ICS");
  }
});

app.listen(PORT, () => {
  console.log(`Serveur ICS JR actif sur port ${PORT}`);
});
