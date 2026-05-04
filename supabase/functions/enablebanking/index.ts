// ════════════════════════════════════════════════════════════════
//  Edge Function: Enable Banking — Open Banking API
//  instaloERP v1.1 — Proxy seguro para Account Information API
// ════════════════════════════════════════════════════════════════
//
//  POST /enablebanking
//  Body: { action: "institutions"|"connect"|"callback"|"sync"|"disconnect", ... }
//
//  Secretos necesarios en Supabase:
//  - ENABLE_BANKING_APP_ID   (UUID de la aplicación)
//  - ENABLE_BANKING_PRIVATE_KEY (clave RSA privada en PEM)
//
// ════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.2.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EB_APP_ID = Deno.env.get("ENABLE_BANKING_APP_ID") || "";
const EB_PRIVATE_KEY_PEM = Deno.env.get("ENABLE_BANKING_PRIVATE_KEY") || "";

const API_BASE = "https://api.enablebanking.com";

// ─── JWT Helper ───

async function makeJWT(): Promise<string> {
  const privateKey = await importPKCS8(EB_PRIVATE_KEY_PEM, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: EB_APP_ID })
    .sign(privateKey);
  return jwt;
}

async function ebFetch(path: string, options: RequestInit = {}): Promise<any> {
  const jwt = await makeJWT();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`EnableBanking ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Actions ───

/** Listar bancos disponibles por país */
async function listInstitutions(country: string = "ES") {
  const path = country ? `/aspsps?country=${country}` : `/aspsps`;
  const data = await ebFetch(path);
  // Normalizar: la API devuelve directamente un array o {aspsps:[...]}
  const aspsps = Array.isArray(data) ? data : (data?.aspsps || data?.results || []);
  return (Array.isArray(aspsps) ? aspsps : []).map((a: any) => ({
    id: a.name,
    name: a.name,
    country: a.country || country,
    logo: a.logo || a.logo_url || null,
    bic: a.bic || null,
  }));
}

/** Debug: devuelve la respuesta cruda de la API para diagnóstico */
async function debugAspsps(country: string) {
  const jwt = await makeJWT();
  const path = country ? `/aspsps?country=${country}` : `/aspsps`;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
  });
  const status = res.status;
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch (_) {}
  return {
    _debug: true,
    status,
    url: `${API_BASE}${path}`,
    responseType: typeof parsed,
    isArray: Array.isArray(parsed),
    keys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : null,
    count: Array.isArray(parsed) ? parsed.length : (parsed?.aspsps?.length || null),
    first3: Array.isArray(parsed) ? parsed.slice(0,3) : (parsed?.aspsps?.slice?.(0,3) || null),
    rawPreview: text.substring(0, 500),
  };
}

/** Iniciar autorización con un banco */
async function startAuth(
  bankName: string,
  bankCountry: string,
  redirectUrl: string,
  cuentaId: string,
  psuType: string = "business",
) {
  // El state codifica la cuenta para el retorno
  const state = `instaloerp_${cuentaId}_${Date.now()}`;

  const validUntil = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  // Validar psu_type (Enable Banking acepta "personal" o "business")
  const validPsuType = ["personal", "business"].includes(psuType) ? psuType : "business";

  const data = await ebFetch("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: bankName, country: bankCountry },
      state: state,
      redirect_url: redirectUrl,
      psu_type: validPsuType,
    }),
  });

  return { url: data.url, state: state };
}

/** Intercambiar code por sesión y obtener cuentas */
async function createSession(code: string) {
  const data = await ebFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return data; // { session_id?, accounts: [{uid, iban?, ...}], ... }
}

/** Obtener transacciones de una cuenta */
async function getTransactions(accountUid: string, dateFrom?: string) {
  const params = dateFrom ? `?date_from=${dateFrom}` : '';
  return await ebFetch(`/accounts/${accountUid}/transactions${params}`);
}

/** Obtener saldos de una cuenta */
async function getBalances(accountUid: string) {
  return await ebFetch(`/accounts/${accountUid}/balances`);
}

/** Obtener detalles completos de una cuenta (IBAN, BIC, divisa, titular, tipo, límite...) */
async function getAccountDetails(accountUid: string) {
  try {
    return await ebFetch(`/accounts/${accountUid}/details`);
  } catch (_) {
    return null;
  }
}

/** Borrar sesión en Enable Banking (revoca el consentimiento PSD2) */
async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const jwt = await makeJWT();
    const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
    });
    // 200/204 = borrada, 404 = ya no existe (ambos OK)
    return res.ok || res.status === 404;
  } catch (_) {
    // Si falla, no bloquear la desconexión
    return false;
  }
}

// ─── Sync: descargar transacciones y guardar en movimientos_bancarios ───

async function syncTransactions(
  sb: any,
  empresaId: string,
  cuentaBancariaId: string,
  ebAccountUid: string
) {
  // Buscar última fecha sincronizada
  const { data: cuenta } = await sb
    .from("cuentas_bancarias")
    .select("nordigen_ultimo_sync")
    .eq("id", cuentaBancariaId)
    .single();

  // Calcular date_from:
  // - PSD2 limita a 90 días hacia atrás (algunos bancos como Santander lo aplican estricto)
  // - Intentamos ir lo más atrás posible: 1-ene del año actual o lastSync-1, lo que sea más antiguo
  // - Pero NUNCA más de 89 días atrás (para no exceder el límite PSD2)
  const lastSync = cuenta?.nordigen_ultimo_sync;
  const ene1 = `${new Date().getFullYear()}-01-01`;

  // Límite PSD2: máximo 89 días atrás (margen de seguridad sobre los 90)
  const maxBack = new Date();
  maxBack.setDate(maxBack.getDate() - 89);
  const limitePSD2 = maxBack.toISOString().slice(0, 10);

  let dateFrom: string;
  if (lastSync) {
    const d = new Date(lastSync);
    d.setDate(d.getDate() - 1);
    const fromSync = d.toISOString().slice(0, 10);
    // Usar la fecha más antigua entre lastSync-1 y 1-ene
    dateFrom = fromSync < ene1 ? fromSync : ene1;
  } else {
    // Primera sync: intentar desde 1-ene
    dateFrom = ene1;
  }

  // Aplicar límite PSD2: nunca más de 89 días atrás
  if (dateFrom < limitePSD2) {
    dateFrom = limitePSD2;
  }

  // Obtener transacciones desde date_from
  const txData = await getTransactions(ebAccountUid, dateFrom);
  const transactions = txData?.transactions || [];

  if (!transactions.length) {
    return { inserted: 0, message: "Sin nuevas transacciones" };
  }

  // Usar todas las transacciones (ya vienen filtradas por date_from)
  const filtered = transactions;

  // Evitar duplicados: buscar origen_ref existentes
  const refs = filtered
    .map((t: any) => t.transaction_id || t.entry_reference || "")
    .filter(Boolean);

  const { data: existentes } = await sb
    .from("movimientos_bancarios")
    .select("origen_ref")
    .eq("cuenta_id", cuentaBancariaId)
    .in("origen_ref", refs.length ? refs : ["__none__"]);

  const existSet = new Set((existentes || []).map((e: any) => e.origen_ref));

  // Preparar inserts
  const rows = filtered
    .filter((t: any) => {
      const ref = t.transaction_id || t.entry_reference || "";
      return ref && !existSet.has(ref);
    })
    .map((t: any) => {
      // Enable Banking / Berlin Group: transaction_amount.amount puede ser
      // siempre positivo, con credit_debit_indicator = "CRDT" | "DBIT"
      // O puede ya venir con signo. Normalizamos:
      let importe = parseFloat(t.transaction_amount?.amount || 0);
      const cdi = (t.credit_debit_indicator || "").toUpperCase();
      if (cdi === "DBIT" && importe > 0) importe = -importe;
      if (cdi === "CRDT" && importe < 0) importe = Math.abs(importe);

      return {
        empresa_id: empresaId,
        cuenta_id: cuentaBancariaId,
        fecha_operacion:
          t.booking_date || t.value_date || new Date().toISOString().slice(0, 10),
        fecha_valor: t.value_date || null,
        concepto:
          t.remittance_information?.join(" ") ||
          t.creditor_name ||
          t.debtor_name ||
          t.additional_information ||
          "Movimiento Open Banking",
        importe,
        referencia: t.transaction_id || t.entry_reference || null,
        estado: "pendiente",
        origen: "nordigen",
        origen_ref: t.transaction_id || t.entry_reference || null,
      };
    });

  let inserted = 0;
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { data, error } = await sb
        .from("movimientos_bancarios")
        .insert(batch)
        .select();
      if (!error && data) inserted += data.length;
    }
  }

  // ─── Actualizar TODA la metadata de la cuenta desde Open Banking ───
  // Saldos + límite de crédito (deducido) + IBAN + BIC + titular + divisa
  // Solo se actualiza lo que viene del banco. Se preservan los campos manuales.
  const update: any = { nordigen_ultimo_sync: new Date().toISOString() };

  // 1. SALDOS — buscar todos los balance_types relevantes
  try {
    const bal = await getBalances(ebAccountUid);
    const balances = bal?.balances || [];
    // Helper: extraer importe respetando credit_debit_indicator
    const importe = (b: any) => {
      if (!b?.balance_amount?.amount) return null;
      let v = parseFloat(b.balance_amount.amount);
      const cdi = (b.credit_debit_indicator || "").toUpperCase();
      if (cdi === "DBIT" && v > 0) v = -v;
      return v;
    };
    // Tipos típicos de Berlin Group / Enable Banking:
    //   closingBooked     → saldo contable real (incl. negativos en pólizas)
    //   interimAvailable  → saldo disponible (incluye crédito disponible)
    //   creditLine        → línea de crédito (techo)
    const closing = balances.find((b: any) => /closingBooked/i.test(b.balance_type)) || null;
    const available = balances.find((b: any) => /interimAvailable|expected|openingBooked/i.test(b.balance_type)) || null;
    const creditLineBal = balances.find((b: any) => /creditLine|preCredit/i.test(b.balance_type)) || null;

    const saldoReal = closing ? importe(closing) : null;
    const saldoDispo = available ? importe(available) : null;
    let limiteCredito = creditLineBal ? Math.abs(importe(creditLineBal) || 0) : null;
    // Si no hay creditLine explícito pero tenemos disponible y real → calcular
    if (!limiteCredito && saldoReal != null && saldoDispo != null && saldoDispo > saldoReal) {
      limiteCredito = saldoDispo - saldoReal;
    }

    // Saldo a guardar: preferimos closingBooked (real). Si no, interimAvailable.
    // Pero si la cuenta ya tiene saldo manual y la API devuelve 0, no pisarlo.
    const saldoNuevo = (saldoReal != null) ? saldoReal : saldoDispo;
    if (saldoNuevo != null && saldoNuevo !== 0) {
      update.saldo = saldoNuevo;
      update.saldo_fecha = new Date().toISOString();
    }
    // Limite de crédito: solo guardar si > 0
    if (limiteCredito != null && limiteCredito > 0) {
      update.limite_poliza = Math.round(limiteCredito * 100) / 100;
    }
  } catch (_) { /* balances API falló */ }

  // 2. DETALLES DE CUENTA — IBAN, BIC, titular, divisa, tipo
  try {
    const det = await getAccountDetails(ebAccountUid);
    const acc = det?.accounts?.[0] || det || {};
    if (acc.iban) update.iban = acc.iban;
    if (acc.bic_fi || acc.bic) update.bic = acc.bic_fi || acc.bic;
    if (acc.currency) update.divisa = acc.currency;
    // Titular
    const titular = acc.account_owner_name
      || (Array.isArray(acc.account_owners) && acc.account_owners[0]?.name)
      || (Array.isArray(acc.psu_owners) && acc.psu_owners[0]?.name)
      || null;
    if (titular) update.titular = titular;
    // Producto / tipo de cuenta
    if (acc.product) update.tipo_producto = acc.product;
    if (acc.cash_account_type) update.tipo_cuenta = acc.cash_account_type;
  } catch (_) { /* details API falló o no soportada */ }

  // 3. Aplicar update (siempre actualizamos al menos la fecha de sync)
  await sb.from("cuentas_bancarias")
    .update(update)
    .eq("id", cuentaBancariaId);

  return { inserted, message: `${inserted} nuevas transacciones importadas` };
}

// ─── Handler principal ───

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    if (!EB_APP_ID || !EB_PRIVATE_KEY_PEM) {
      return new Response(
        JSON.stringify({
          error:
            "Enable Banking no configurado. Configura ENABLE_BANKING_APP_ID y ENABLE_BANKING_PRIVATE_KEY en los secretos de Supabase.",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { action } = body;

    // Auth: verificar que el usuario está autenticado
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    let result: any;

    switch (action) {
      // ── Debug (temporal) ──
      case "debug": {
        const country = body.country || "ES";
        result = await debugAspsps(country);
        break;
      }

      // ── Listar bancos ──
      case "institutions": {
        const country = body.country || "ES";
        result = await listInstitutions(country);
        break;
      }

      // ── Iniciar conexión (redirect al banco) ──
      case "connect": {
        const { institution_id, institution_country, redirect_url, empresa_id, cuenta_id, psu_type } = body;
        if (!institution_id || !redirect_url || !empresa_id || !cuenta_id) {
          throw new Error(
            "Faltan parámetros: institution_id, redirect_url, empresa_id, cuenta_id"
          );
        }
        const country = institution_country || "ES";
        const authData = await startAuth(
          institution_id,
          country,
          redirect_url,
          cuenta_id,
          psu_type || "business",
        );

        // Guardar state como requisition_id (reutilizamos la columna)
        await sb
          .from("cuentas_bancarias")
          .update({
            nordigen_requisition_id: authData.state,
            nordigen_conectado: false,
          })
          .eq("id", cuenta_id);

        result = { link: authData.url, requisition_id: authData.state };
        break;
      }

      // ── Callback: el usuario volvió del banco con un code ──
      case "callback": {
        const { code, cuenta_id, empresa_id, psu_type } = body;
        if (!code || !cuenta_id) {
          throw new Error("Faltan parámetros: code, cuenta_id");
        }

        const session = await createSession(code);
        const accounts = session?.accounts || [];

        // valid_until viene en la respuesta de la session (cuando hay) → para mostrar aviso de renovación
        const validUntil = session?.access?.valid_until || null;

        if (accounts.length > 0) {
          // Primera cuenta → vincular a la cuenta existente que el usuario eligió
          const accUid = accounts[0].uid;
          const iban = accounts[0].iban || null;

          const updateData: any = {
            nordigen_account_id: accUid,
            nordigen_conectado: true,
            // Guardar session_id para poder revocar el consentimiento PSD2 al desconectar
            nordigen_requisition_id: session.session_id || null,
            nordigen_valid_until: validUntil,
            nordigen_psu_type: psu_type || "business",
          };
          if (iban) updateData.iban = iban;

          await sb
            .from("cuentas_bancarias")
            .update(updateData)
            .eq("id", cuenta_id);

          // Cuentas adicionales → crear automáticamente
          const createdAccounts: string[] = [accUid];
          if (accounts.length > 1 && empresa_id) {
            // Obtener la cuenta original para copiar entidad/color
            const { data: cuentaOrig } = await sb
              .from("cuentas_bancarias")
              .select("entidad, color")
              .eq("id", cuenta_id)
              .single();

            for (let i = 1; i < accounts.length; i++) {
              const acc = accounts[i];
              const accIban = acc.iban || null;
              // Verificar que no existe ya una cuenta con este account_id
              const { data: existente } = await sb
                .from("cuentas_bancarias")
                .select("id")
                .eq("empresa_id", empresa_id)
                .eq("nordigen_account_id", acc.uid)
                .maybeSingle();

              if (!existente) {
                const ibanCorto = accIban
                  ? "···" + accIban.slice(-4)
                  : `Cuenta ${i + 1}`;
                const { data: nueva } = await sb
                  .from("cuentas_bancarias")
                  .insert({
                    empresa_id,
                    nombre: `${cuentaOrig?.entidad || "Banco"} ${ibanCorto}`,
                    iban: accIban,
                    entidad: cuentaOrig?.entidad || null,
                    color: cuentaOrig?.color || "#2563EB",
                    activa: true,
                    saldo: 0,
                    nordigen_account_id: acc.uid,
                    nordigen_conectado: true,
                    nordigen_requisition_id: null,
                  })
                  .select("id")
                  .single();
                if (nueva) createdAccounts.push(acc.uid);
              } else {
                // Ya existe → actualizar conexión
                await sb
                  .from("cuentas_bancarias")
                  .update({
                    nordigen_account_id: acc.uid,
                    nordigen_conectado: true,
                  })
                  .eq("id", existente.id);
                createdAccounts.push(acc.uid);
              }
            }
          }

          result = {
            status: "LN",
            accounts: createdAccounts,
            total_accounts: accounts.length,
            created_extra: accounts.length - 1,
            session_id: session.session_id || null,
          };
        } else {
          result = { status: "NO_ACCOUNTS", accounts: [] };
        }
        break;
      }

      // ── Sincronizar transacciones ──
      case "sync": {
        const { empresa_id, cuenta_id, nordigen_account_id } = body;
        if (!empresa_id || !cuenta_id || !nordigen_account_id) {
          throw new Error("Faltan parámetros para sincronizar");
        }
        result = await syncTransactions(
          sb,
          empresa_id,
          cuenta_id,
          nordigen_account_id
        );
        break;
      }

      // ── Desconectar ──
      case "disconnect": {
        const { cuenta_id } = body;

        // 1. Recuperar session_id almacenado para revocar en Enable Banking
        const { data: cuentaDisc } = await sb
          .from("cuentas_bancarias")
          .select("nordigen_requisition_id")
          .eq("id", cuenta_id)
          .single();

        let sessionDeleted = false;
        const storedSessionId = cuentaDisc?.nordigen_requisition_id;
        if (storedSessionId && !storedSessionId.startsWith("instaloerp_")) {
          // Es un session_id real (no un state string del flujo auth)
          sessionDeleted = await deleteSession(storedSessionId);
        }

        // 2. Limpiar BD (siempre, aunque falle el DELETE en EB)
        await sb
          .from("cuentas_bancarias")
          .update({
            nordigen_requisition_id: null,
            nordigen_account_id: null,
            nordigen_conectado: false,
            nordigen_ultimo_sync: null,
          })
          .eq("id", cuenta_id);

        result = { ok: true, session_deleted: sessionDeleted };
        break;
      }

      // ── Forzar borrado de sesión (para resolver sesiones expiradas) ──
      case "delete_session": {
        const { session_id: sessId } = body;
        if (!sessId) throw new Error("Falta session_id");
        const deleted = await deleteSession(sessId);
        result = { ok: true, deleted };
        break;
      }

      default:
        throw new Error(`Acción no reconocida: ${action}`);
    }

    return new Response(JSON.stringify(result), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Error interno" }),
      { status: 400, headers: corsHeaders }
    );
  }
});
