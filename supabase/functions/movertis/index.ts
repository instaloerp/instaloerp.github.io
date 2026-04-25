// ════════════════════════════════════════════════════════════════
//  Edge Function: movertis — Proxy seguro para API de flota GPS
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  POST /movertis
//  Body: { action: 'vehicles' | 'trips' | 'drivers', params: {...} }
//
//  Env vars requeridas:
//    MOVERTIS_API_TOKEN  — token proporcionado por soporte Movertis
//    MOVERTIS_API_URL    — base URL (ej: https://devapi.hellomovertis.com)
// ════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const API_TOKEN = Deno.env.get('MOVERTIS_API_TOKEN') || '';
const API_URL   = Deno.env.get('MOVERTIS_API_URL')   || 'https://devapi.hellomovertis.com';

// ── Acciones disponibles ──────────────────────────────────
interface ActionDef {
  method: string;
  path: string;
  defaultBody?: Record<string, unknown>;
}

const ACTIONS: Record<string, ActionDef> = {
  // Vehículos — posición en tiempo real
  vehicles: {
    method: 'POST',
    path: '/vehicle/showvehicles',
    defaultBody: { id: [], flags: { basicData: true, lastMessagePosition: true } }
  },
  // Viajes por vehículo(s) en rango de fechas
  trips: {
    method: 'POST',
    path: '/vehicle/summarytrips'
  },
  // Trayectos detallados
  showtrips: {
    method: 'POST',
    path: '/vehicle/showtrips'
  },
  // Conductores
  drivers: {
    method: 'POST',
    path: '/driver/getdrivers',
    defaultBody: { id: [], flags: { basicData: true } }
  },
  // Grupos de conductores
  driverGroups: {
    method: 'GET',
    path: '/driver/groups?driverInfo=true'
  },
  // Fichar conductor ↔ vehículo
  bind: {
    method: 'POST',
    path: '/driver/bind'
  },
  unbind: {
    method: 'POST',
    path: '/driver/unbind'
  },
  // Historial de fichajes
  bindrecords: {
    method: 'POST',
    path: '/driver/bindrecords'
  },
  // Informes disponibles
  reportlist: {
    method: 'GET',
    path: '/report/reportlist'
  },
  // Consultar informe
  checkreport: {
    method: 'POST',
    path: '/report/checkreport'
  },
  // Costes
  costs: {
    method: 'POST',
    path: '/costs/read'
  },
  // Geocodificación
  addressByPos: {
    method: 'POST',
    path: '/map/adressbypos'
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (!API_TOKEN) {
    return new Response(JSON.stringify({ error: 'MOVERTIS_API_TOKEN no configurado' }), {
      status: 500, headers: CORS
    });
  }

  try {
    const { action, params } = await req.json();

    if (!action || !ACTIONS[action]) {
      return new Response(JSON.stringify({
        error: 'Acción no válida',
        available: Object.keys(ACTIONS)
      }), { status: 400, headers: CORS });
    }

    const def = ACTIONS[action];
    const url = API_URL + def.path;
    const body = params || def.defaultBody || {};

    const fetchOpts: RequestInit = {
      method: def.method,
      headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json'
      }
    };

    // GET requests no llevan body
    if (def.method !== 'GET') {
      fetchOpts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, fetchOpts);
    const data = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({
        error: 'Error de Movertis API',
        status: resp.status,
        detail: data
      }), { status: resp.status, headers: CORS });
    }

    return new Response(JSON.stringify(data), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: CORS
    });
  }
});
