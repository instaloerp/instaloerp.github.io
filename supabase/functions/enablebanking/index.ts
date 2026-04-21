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
  cuentaId: string
) {
  // El state codifica la cuenta para el retorno
  const state = `instaloerp_${cuentaId}_${Date.now()}`;

  const validUntil = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  const data = await ebFetch("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: bankName, country: bankCountry },
      state: state,
      redirect_url: redirectUrl,
      psu_type: "personal",
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
async function getTransactions(accountUid: string) {
  return await ebFetch(`/accounts/${accountUid}/transactions`);
}

/** Obtener saldos de una cuenta */
async function getBalances(accountUid: string) {
  return await ebFetch(`/accounts/${accountUid}/balances`);
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

  // Obtener transacciones
  const txData = await getTransactions(ebAccountUid);
  const transactions = txData?.transactions || [];

  if (!transactions.length) {
    return { inserted: 0, message: "Sin nuevas transacciones" };
  }

  // Filtrar por fecha si hay último sync
  const lastSync = cuenta?.nordigen_ultimo_sync;
  const filtered = lastSync
    ? transactions.filter((t: any) => {
        const txDate = t.booking_date || t.value_date || "";
        return txDate >= new Date(lastSync).toISOString().slice(0, 10);
      })
    : transactions;

  if (!filtered.length) {
    return { inserted: 0, message: "Sin nuevas transacciones" };
  }

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

  // Actualizar saldo desde API
  // Nota: algunos bancos (Abanca) devuelven siempre 0 en el balance API.
  // En esos casos, NO pisamos el saldo manual que el usuario haya puesto.
  let saldoActualizado = false;
  try {
    const bal = await getBalances(ebAccountUid);
    const balances = bal?.balances || [];
    const interim =
      balances.find((b: any) => b.balance_type === "interimAvailable") ||
      balances.find((b: any) => b.balance_type === "closingBooked") ||
      balances[0];
    if (interim?.balance_amount?.amount != null) {
      let saldo = parseFloat(interim.balance_amount.amount);
      const balCdi = (interim.credit_debit_indicator || "").toUpperCase();
      if (balCdi === "DBIT" && saldo > 0) saldo = -saldo;

      // Solo actualizar saldo si la API devuelve un valor distinto de 0.
      // Si devuelve 0, no pisamos el saldo existente (puede ser manual o
      // de un banco que no informa bien el saldo vía API como Abanca).
      if (saldo !== 0) {
        await sb
          .from("cuentas_bancarias")
          .update({
            saldo,
            saldo_fecha: new Date().toISOString(),
            nordigen_ultimo_sync: new Date().toISOString(),
          })
          .eq("id", cuentaBancariaId);
        saldoActualizado = true;
      }
    }
  } catch (_) {
    // API de saldos falló
  }

  // Si no se actualizó el saldo, al menos actualizar la fecha de sync
  if (!saldoActualizado) {
    await sb
      .from("cuentas_bancarias")
      .update({ nordigen_ultimo_sync: new Date().toISOString() })
      .eq("id", cuentaBancariaId);
  }

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
        const { institution_id, institution_country, redirect_url, empresa_id, cuenta_id } = body;
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
          cuenta_id
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
        const { code, cuenta_id, empresa_id } = body;
        if (!code || !cuenta_id) {
          throw new Error("Faltan parámetros: code, cuenta_id");
        }

        const session = await createSession(code);
        const accounts = session?.accounts || [];

        if (accounts.length > 0) {
          // Primera cuenta → vincular a la cuenta existente que el usuario eligió
          const accUid = accounts[0].uid;
          const iban = accounts[0].iban || null;

          const updateData: any = {
            nordigen_account_id: accUid,
            nordigen_conectado: true,
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
        // Enable Banking no tiene endpoint de borrado de sesiones,
        // simplemente limpiamos la BD
        await sb
          .from("cuentas_bancarias")
          .update({
            nordigen_requisition_id: null,
            nordigen_account_id: null,
            nordigen_conectado: false,
            nordigen_ultimo_sync: null,
          })
          .eq("id", cuenta_id);
        result = { ok: true };
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
