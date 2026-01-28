import express from "express";
import fetch from "node-fetch";
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

    // Fenêtre : aujourd’hui → +6 mois
    const now = new Date();
    const limit = new Date();
    limit.setMonth(limit.getMonth() + 6);

    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 35) continue;

      const dateFR = cells[1];
      if (!dateFR) continue;

      const [d, m, y] = dateFR.split("/");
      const jsDate = new Date(`${y}-${m}-${d}T00:00:00`);

      if (jsDate < now || jsDate > limit) continue;

      const date = `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`;

      let index = 2;
      let matinSalle = "";
      let amSalle = "";
      let soir = cells[34] || "";

      for (const salle of SALLES) {
        const matin = cells[index] || "";
        const am = cells[index + 1] || "";

        if (matin.includes("JR")) matinSalle = salle;
        if (am.includes("JR")) amSalle = salle;

        index += 2;
      }

      if (matinSalle) {
        events.push({
          title: `JR — Matin — ${matinSalle}`,
          start: `${date}T080000`,
          end: `${date}T130000`
        });
      }

      if (amSalle) {
        events.push({
          title: `JR — Après‑midi — ${amSalle}`,
          start: `${date}T130000`,
          end: `${date}T190000`
        });
      }

      if (soir.includes("JR")) {
        events.push({
          title: `JR — Astreinte du soir`,
          start: `${date}T190000`,
          end: `${date}T210000`
        });
      }
    }

    // ICS compact
    let ics = `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-TIMEZONE:Europe/Paris
BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:STANDARD
DTSTART:20241027T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20240331T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
END:DAYLIGHT
END:VTIMEZONE
`;

    for (const ev of events) {
      ics += `BEGIN:VEVENT
SUMMARY:${ev.title}
DTSTART;TZID=Europe/Paris:${ev.start}
DTEND;TZID=Europe/Paris:${ev.end}
END:VEVENT
`;
    }

    ics += "END:VCALENDAR";

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);

  } catch (error) {
    console.error("Erreur ICS :", error);
    res.status(500).send("Erreur interne du serveur ICS");
  }
});

app.listen(PORT, () => {
  console.log(`Serveur ICS JR actif sur port ${PORT}`);
});
