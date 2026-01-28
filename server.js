import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = process.env.PORT || 3000;

const PLANNING_URL = "https://serveur-plan.onrender.com/planning";

/**
 * Convertit une date locale française en format ICS UTC (avec le Z final)
 * Gère automatiquement le passage heure d'été/hiver (+1h ou +2h)
 */
function toUTCICS(year, month, day, hour, minute) {
  // On crée une date en spécifiant qu'elle appartient au fuseau Paris
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  
  // Cette astuce permet de transformer la string "locale" en objet Date UTC correct
  const dateObj = new Date(new Date(dateStr).toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  
  // Retourne le format YYYYMMDDTHHMMSSZ
  return dateObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function makeUID(ev, index) {
  return `${ev.start}-${index}@jr-jeanamedee`;
}

app.get("/jr.ics", async (req, res) => {
  try {
    const response = await fetch(PLANNING_URL);
    if (!response.ok) return res.status(500).send("Erreur récupération planning");

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
      const cells = Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 35) continue;

      const dateFR = cells[1];
      if (!dateFR) continue;

      const [d, m, y] = dateFR.split("/").map(n => parseInt(n, 10));
      if (!d || !m || !y) continue;

      let index = 2;
      let matinSalle = "";
      let amSalle = "";
      const soir = cells[34] || "";

      for (const salle of SALLES) {
        if ((cells[index] || "").includes("JR")) matinSalle = salle;
        if ((cells[index + 1] || "").includes("JR")) amSalle = salle;
        index += 2;
      }

      if (matinSalle) {
        events.push({
          title: `JR — Matin — ${matinSalle}`,
          start: toUTCICS(y, m, d, 8, 0),
          end: toUTCICS(y, m, d, 13, 0),
        });
      }

      if (amSalle) {
        events.push({
          title: `JR — Après‑midi — ${amSalle}`,
          start: toUTCICS(y, m, d, 13, 0),
          end: toUTCICS(y, m, d, 19, 0),
        });
      }

      if (soir.includes("JR")) {
        events.push({
          title: `JR — Astreinte du soir`,
          start: toUTCICS(y, m, d, 19, 0),
          end: toUTCICS(y, m, d, 21, 0),
        });
      }
    }

    const nowStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    let ics = `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
PRODID:-//JR//Planning JR Only//FR
`;

    events.forEach((ev, idx) => {
      ics += `BEGIN:VEVENT
UID:${makeUID(ev, idx)}
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
    res.status(500).send("Erreur interne");
  }
});

app.listen(PORT, () => console.log(`Serveur actif sur port ${PORT}`));
