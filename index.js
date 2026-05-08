const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
const ML_SECRET = process.env.ML_SECRET;

const ZONAS = [
  { nombre: 'Capital Federal', id: 'TUxBUENBUGw3M2E1' },
  { nombre: 'GBA Norte', id: 'TUxBUEdSQWU4ZDkz' },
  { nombre: 'GBA Sur', id: 'TUxBUEdSQXJlMDNm' },
  { nombre: 'GBA Oeste', id: 'TUxBUEdSQWVmNTVm' }
];

app.use((req, res, next) => {
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

app.get('/buscar', async function(req, res) {
  const marca = req.query.marca;
  const modelo = req.query.modelo;
  const anio = req.query.anio;

  if (!marca || !modelo || !anio) {
    return res.status(400).json({ error: 'Faltan parametros' });
  }

  try {
    const token = await getToken();
    const q = encodeURIComponent(marca + ' ' + modelo + ' ' + anio);

    const promesas = ZONAS.map(async function(zona) {
      try {
        const url = 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1744&q=' + q + '&state=' + zona.id + '&condition=used&limit=20';
        const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const d = await r.json();
        const pubs = (d.results || [])
          .filter(function(item) { return item.price > 1000000; })
          .map(function(item) {
            return { titulo: item.title, precio: item.price, zona: zona.nombre, km: extraerKm(item) };
          });
        if (pubs.length > 0) return pubs;
        const url2 = 'https://api.mercadolibre.com/sites/MLA/search?q=' + q + '&state=' + zona.id + '&condition=used&limit=20';
        const r2 = await fetch(url2, { headers: { 'Authorization': 'Bearer ' + token } });
        const d2 = await r2.json();
        return (d2.results || [])
          .filter(function(item) { return item.price > 1000000; })
          .map(function(item) {
            return { titulo: item.title, precio: item.price, zona: zona.nombre, km: extraerKm(item) };
          });
      } catch(e) {
        return [];
      }
    });

    const resultados = await Promise.all(promesas);

    const estadisticas = ZONAS.map(function(z, i) {
      const pubs = resultados[i];
      if (!pubs.length) return { zona: z.nombre, cant: 0, avg: null, min: null, max: null };
      const precios = pubs.map(function(p) { return p.precio; });
      const suma = precios.reduce(function(a, b) { return a + b; }, 0);
      return {
        zona: z.nombre,
        cant: pubs.length,
        avg: Math.round(suma / precios.length),
        min: Math.min.apply(null, precios),
        max: Math.max.apply(null, precios)
      };
    });

    const todas = resultados.reduce(function(acc, arr) { return acc.concat(arr); }, []);
    res.json({ estadisticas: estadisticas, publicaciones: todas });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', function(req, res) {
  res.json({ status: 'ok', servicio: 'Nissan ML Server' });
});

app.listen(PORT, function() {
  console.log('Servidor corriendo en puerto ' + PORT);
});
