import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = process.env.PORT || 3000;

// URL de ton proxy Render qui renvoie le HTML du planning
// ⚠️ Remplace par l'URL réelle de ton serveur proxy Render
const PLANNING_URL = "https://serveur_plan.onrender.com/planning";

// Conversion d'une date locale (France) en UTC pour ICS
function toUTC(date, hour, minute) {
  // date est un objet Date représentant le jour (en local)
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0
  );

  // Conversion en ISO UTC, puis format ICS (YYYYMMDDTHHMMSSZ)
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Génère un UID simple et stable à partir de la date + titre
function makeUID(ev, index) {
  return `${ev.start}-${index}@jr-jeanamedee`;
}

app.get("/jr.ics", async (req, res) => {
  try {
    const response = await fetch(PLANNING_URL);
    if (!response.ok) {
      console.error("Erreur récupération planning via proxy :", response.status);
      return res.status(500).send("Erreur récupération planning");
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const rows = Array.from(document.querySelectorAll("tr"));
    const events = [];

    const SALLES = [
      "RADIO MERMOZ", "ANGIO", "SCANNER1", "SCANNER2", "SCANNER3",
      "MAMMO", "IRM1", "IRM2", "IRM3", "SANTY", "ST PRIEST",
      "GERLAND", "ADMIN", "OFF", "VACANCES", "ABSENCES TP"
    ];

    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll("td")).map(td =>
        td.textContent.trim()
      );
      if (cells.length < 35) continue;

      const dateFR = cells[1];
      if (!dateFR) continue;

      const [d, m, y] = dateFR.split("/");
      if (!d || !m || !y) continue;

      // Date locale (France) à minuit
      const jsDate = new Date(
        parseInt(y, 10),
        parseInt(m, 10) - 1,
        parseInt(d, 10),
        0,
        0,
        0,
        0
      );

      let index = 2;
      let matinSalle = "";
      let amSalle = "";
      const soir = cells[34] || "";

      for (const salle of SALLES) {
        const matin = cells[index] || "";
        const am = cells[index + 1] || "";

        if (matin.includes("JR")) matinSalle = salle;
        if (am.includes("JR")) amSalle = salle;

        index += 2;
      }

      // Matin 08h–13h
      if (matinSalle) {
        events.push({
          title: `JR — Matin — ${matinSalle}`,
          start: toUTC(jsDate, 8, 0),
          end: toUTC(jsDate, 13, 0),
        });
      }

      // Après-midi 13h–19h
      if (amSalle) {
        events.push({
          title: `JR — Après‑midi — ${amSalle}`,
          start: toUTC(jsDate, 13, 0),
          end: toUTC(jsDate, 19, 0),
        });
      }

      // Soir 19h–21h
      if (soir.includes("JR")) {
        events.push({
          title: `JR — Astreinte du soir`,
          start: toUTC(jsDate, 19, 0),
          end: toUTC(jsDate, 21, 0),
        });
      }
    }

    // Construction ICS
    let ics = `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
PRODID:-//JR//Planning JR Only//FR
`;

    const nowStamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0] + "Z";

    events.forEach((ev, idx) => {
      const uid = makeUID(ev, idx);
      ics += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${nowStamp}
SUMMARY:${ev.title}
DTSTART:${ev.start}
DTEND:${ev.end}
END:VEVENT
`;
    });

    ics += "END:VCALENDAR";

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);

  } catch (error) {
    console.error("Erreur ICS JR :", error);
    res.status(500).send("Erreur interne du serveur ICS");
  }
});

app.listen(PORT, () => {
  console.log(`Serveur ICS JR actif sur port ${PORT}`);
});
