const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
const ML_SECRET = process.env.ML_SECRET;

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

async function getToken() {
  const r = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + ML_CLIENT_ID + '&client_secret=' + ML_SECRET
  });
  const d = await r.json();
  return d.access_token;
}

function extraerKm(item) {
  if (!item.attributes) return null;
  const a = item.attributes.find(function(x) { return x.id === 'KILOMETERS'; });
  if (!a) return null;
  const n = parseInt((a.value_name || '').replace(/\D/g, ''));
  return isNaN(n) ? null : n;
}

const ZONAS = [
  { nombre: 'Capital Federal', stateId: 'TUxBUENBUGw3M2E1' },
  { nombre: 'GBA Norte',       stateId: 'TUxBUEdSQWU4ZDkz' },
  { nombre: 'GBA Sur',         stateId: 'TUxBUEdSQXJlMDNm' },
  { nombre: 'GBA Oeste',       stateId: 'TUxBUEdSQWVmNTVm' }
];

async function buscarEnZona(token, marca, modelo, anio, zona) {
  const q = encodeURIComponent(marca + ' ' + modelo + ' ' + anio);
  const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  const urls = [
    'https://api.mercadolibre.com/sites/MLA/search?category=MLA1744&q=' + q + '&state=' + zona.stateId + '&condition=used&limit=20',
    'https://api.mercadolibre.com/sites/MLA/search?q=' + q + '&state=' + zona.stateId + '&condition=used&limit=20'
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) continue;
      const d = await r.json();
      const pubs = (d.results || [])
        .filter(function(item) { return item.price > 1000000; })
        .map(function(item) {
          return { titulo: item.title, precio: item.price, zona: zona.nombre, km: extraerKm(item) };
        });
      if (pubs.length > 0) return pubs;
    } catch(e) { continue; }
  }
  return [];
}

app.get('/test', async function(req, res) {
  try {
    const token = await getToken();
    const r = await fetch('https://api.mercadolibre.com/sites/MLA/search?category=MLA1744&q=toyota+corolla+2020&condition=used&limit=3', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await r.json();
    res.json({
      token_ok: !!token,
      total_results: d.paging ? d.paging.total : 0,
      primer_resultado: d.results && d.results[0] ? { titulo: d.results[0].title, precio: d.results[0].price, estado: d.results[0].address } : null,
      error: d.error || null
    });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.get('/buscar', async function(req, res) {
  const marca = req.query.marca;
  const modelo = req.query.modelo;
  const anio = req.query.anio;
  if (!marca || !modelo || !anio) {
    return res.status(400).json({ error: 'Faltan parametros' });
  }
  try {
    let token = null;
    try { token = await getToken(); } catch(e) {}
    const resultados = await Promise.all(
      ZONAS.map(function(zona) { return buscarEnZona(token, marca, modelo, anio, zona); })
    );
    const estadisticas = ZONAS.map(function(z, i) {
      const pubs = resultados[i];
      if (!pubs.length) return { zona: z.nombre, cant: 0, avg: null, min: null, max: null };
      const precios = pubs.map(function(p) { return p.precio; });
      return {
        zona: z.nombre, cant: pubs.length,
        avg: Math.round(precios.reduce(function(a,b){return a+b;},0) / precios.length),
        min: Math.min.apply(null, precios),
        max: Math.max.apply(null, precios)
      };
    });
    const todas = resultados.reduce(function(acc, arr) { return acc.concat(arr); }, []);
    console.log('Busqueda:', marca, modelo, anio, '- Total:', todas.length);
    res.json({ estadisticas, publicaciones: todas });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', function(req, res) {
  res.json({ status: 'ok', servicio: 'Nissan ML Server v2' });
});

app.listen(PORT, function() {
  console.log('Servidor corriendo en puerto ' + PORT);
});
