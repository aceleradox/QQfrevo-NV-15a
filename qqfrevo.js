const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 5000;

app.use(express.static(path.join(__dirname, "public")));

/* ===== CARREGAR CONFIG JSON ===== */
const config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
const USER_AGENTS = config.userAgents;
const CATEGORIAS = config.categorias;

/* ===== FUNÇÕES ===== */
function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function classificar(texto = "") {
  const t = texto.toLowerCase();
  let melhor = { cat: null, score: 0 };

  for (const [cat, keys] of Object.entries(CATEGORIAS)) {
    let score = 0;
    keys.forEach(k => { if (t.includes(k)) score++; });
    if (score > melhor.score) melhor = { cat, score };
  }

  return melhor.score > 0 ? melhor.cat : null;
}

/* ===== DUCK SEARCH ===== */
async function duckSearch(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kp=-1`;
  const { data } = await axios.get(url, { headers: { "User-Agent": randomUA() }, timeout: 8000 });
  const $ = cheerio.load(data);
  const links = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const m = href.match(/uddg=([^&]+)/);
    if (m) links.add(decodeURIComponent(m[1]).split("?")[0]);
  });

  return [...links].slice(0, 6);
}

/* ===== API ===== */
app.get("/api/search", async (req, res) => {
  const cidade = req.query.cidade || "";

  const buscas = [];
  for (const cat in CATEGORIAS) {
    buscas.push(`${cat} ${cidade} evento`);
    buscas.push(`${cat} ${cidade} instagram`);
  }

  const resultados = [];
  const visitados = new Set();

  for (const q of buscas) {
    try {
      const links = await duckSearch(q);
      for (const link of links) {
        if (visitados.has(link)) continue;
        visitados.add(link);

        try {
          const { data } = await axios.get(link, { headers: { "User-Agent": randomUA() }, timeout: 7000 });
          const $ = cheerio.load(data);

          const desc = $("meta[property='og:description']").attr("content") || $("title").text();
          const img = $("meta[property='og:image']").attr("content");
          if (!desc || !img) continue;

          const categoria = classificar(desc);
          if (!categoria) continue;

          resultados.push({ categoria, url: link, descricao: desc.slice(0, 300), imagem: img });
        } catch {}
      }
    } catch {}
  }

  res.json(resultados.slice(0, 40));
});

app.listen(PORT, () => console.log(`🔥 qqfrevo n15a rodando em http://localhost:${PORT}`));
