// ════════════════════════════════════════════════════════════════
//  Edge Function: Nordigen/GoCardless Open Banking
//  instaloERP v1.1 — Proxy seguro para Bank Account Data API
// ════════════════════════════════════════════════════════════════
//
//  POST /nordigen
//  Body: { action: "institutions"|"connect"|"accounts"|"sync"|"delete", ... }
//
//  Secretos necesarios en Supabase:
//  - NORDIGEN_SECRET_ID
//  - NORDIGEN_SECRET_KEY
//
// ════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NORDIGEN_SECRET_ID = Deno.env.get("NORDIGEN_SECRET_ID") || "";
const NORDIGEN_SECRET_KEY = Deno.env.get("NORDIGEN_SECRET_KEY") || "";

const API_BASE = "https://bankaccountdata.gocardless.com/api/v2";

// ─── Helpers ───

let _cachedToken: { access: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  // Reutilizar token si no ha expirado (con 60s de margen)
  if (_cachedToken && Date.now() < _cachedToken.expires - 60000) {
    return _cachedToken.access;
  }

  const res = await fetch(`${API_BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret_id: NORDIGEN_SECRET_ID,
      secret_key: NORDIGEN_SECRET_KEY,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token error ${res.status}: ${err}`);
  }

  const data = await res.json();
  _cachedToken = {
    access: data.access,
    expires: Date.now() + (data.access_expires || 86400) * 1000,
  };
  return data.access;
}

async function nordigenFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Nordigen ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Actions ───

/** Listar bancos españoles disponibles */
async function listInstitutions(country: string = "ES") {
  return await nordigenFetch(`/institutions/?country=${country}`);
}

/** Crear requisición (enlace de autorización del banco) */
async function createRequisition(
  institutionId: string,
  redirectUrl: string,
  empresaId: string,
  cuentaId: string
) {
  const ref = `instaloerp_${empresaId}_${cuentaId}_${Date.now()}`;
  const data = await nordigenFetch("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference: ref,
      user_language: "ES",
      agreement: null, // usa el default de 90 días
    }),
  });

  return data; // { id, link, status, accounts, ... }
}

/** Obtener estado de una requisición y sus cuentas */
async function getRequisition(requisitionId: string) {
  return await nordigenFetch(`/requisitions/${requisitionId}/`);
}

/** Obtener transacciones de una cuenta */
async function getTransactions(accountId: string, dateFrom?: string) {
  let path = `/accounts/${accountId}/transactions/`;
  if (dateFrom) path += `?date_from=${dateFrom}`;
  return await nordigenFetch(path);
}

/** Obtener detalles de una cuenta */
async function getAccountDetails(accountId: string) {
  return await nordigenFetch(`/accounts/${accountId}/details/`);
}

/** Obtener saldos de una cuenta */
async function getBalances(accountId: string) {
  return await nordigenFetch(`/accounts/${accountId}/balances/`);
}

/** Eliminar requisición */
async function deleteRequisition(requisitionId: string) {
  const token = await getToken();
  await fetch(`${API_BASE}/requisitions/${requisitionId}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ─── Sync: descargar transacciones y guardar en movimientos_bancarios ───

async function syncTransactions(
  sb: any,
  empresaId: string,
  cuentaBancariaId: string,
  nordigenAccountId: string
) {
  // Buscar última fecha sincronizada
  const { data: cuenta } = await sb
    .from("cuentas_bancarias")
    .select("nordigen_ultimo_sync")
    .eq("id", cuentaBancariaId)
    .single();

  const lastSync = cuenta?.nordigen_ultimo_sync;
  const dateFrom = lastSync
    ? new Date(lastSync).toISOString().slice(0, 10)
    : undefined;

  // Obtener transacciones
  const txData = await getTransactions(nordigenAccountId, dateFrom);
  const booked = txData?.transactions?.booked || [];

  if (!booked.length) {
    return { inserted: 0, message: "Sin nuevas transacciones" };
  }

  // Evitar duplicados: buscar origen_ref existentes
  const refs = booked
    .map((t: any) => t.transactionId || t.internalTransactionId || "")
    .filter(Boolean);

  const { data: existentes } = await sb
    .from("movimientos_bancarios")
    .select("origen_ref")
    .eq("cuenta_id", cuentaBancariaId)
    .in("origen_ref", refs.length ? refs : ["__none__"]);

  const existSet = new Set((existentes || []).map((e: any) => e.origen_ref));

  // Preparar inserts
  const rows = booked
    .filter((t: any) => {
      const ref = t.transactionId || t.internalTransactionId || "";
      return ref && !existSet.has(ref);
    })
    .map((t: any) => ({
      empresa_id: empresaId,
      cuenta_id: cuentaBancariaId,
      fecha_operacion: t.bookingDate || t.valueDate || new Date().toISOString().slice(0, 10),
      fecha_valor: t.valueDate || null,
      concepto: t.remittanceInformationUnstructured ||
        t.remittanceInformationUnstructuredArray?.join(" ") ||
        t.additionalInformation ||
        "Movimiento Open Banking",
      importe: parseFloat(t.transactionAmount?.amount || 0),
      referencia: t.transactionId || t.internalTransactionId || null,
      estado: "pendiente",
      origen: "nordigen",
      origen_ref: t.transactionId || t.internalTransactionId || null,
    }));

  let inserted = 0;
  if (rows.length) {
    // Insertar en lotes de 50
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
  try {
    const bal = await getBalances(nordigenAccountId);
    const saldos = bal?.balances || [];
    const interim =
      saldos.find((b: any) => b.balanceType === "interimAvailable") ||
      saldos.find((b: any) => b.balanceType === "closingBooked") ||
      saldos[0];
    if (interim?.balanceAmount?.amount) {
      await sb.from("cuentas_bancarias").update({
        saldo: parseFloat(interim.balanceAmount.amount),
        saldo_fecha: new Date().toISOString(),
        nordigen_ultimo_sync: new Date().toISOString(),
      }).eq("id", cuentaBancariaId);
    }
  } catch (_) {
    // Saldo no disponible, solo actualizar fecha sync
    await sb.from("cuentas_bancarias").update({
      nordigen_ultimo_sync: new Date().toISOString(),
    }).eq("id", cuentaBancariaId);
  }

  // Recalcular saldo si no pudimos obtenerlo de la API
  return { inserted, message: `${inserted} nuevas transacciones importadas` };
}

// ─── Handler principal ───

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    if (!NORDIGEN_SECRET_ID || !NORDIGEN_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "Nordigen no configurado. Configura NORDIGEN_SECRET_ID y NORDIGEN_SECRET_KEY en los secretos de Supabase." }),
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
      case "institutions": {
        const country = body.country || "ES";
        result = await listInstitutions(country);
        break;
      }

      case "connect": {
        const { institution_id, redirect_url, empresa_id, cuenta_id } = body;
        if (!institution_id || !redirect_url || !empresa_id || !cuenta_id) {
          throw new Error("Faltan parámetros: institution_id, redirect_url, empresa_id, cuenta_id");
        }
        const req_data = await createRequisition(institution_id, redirect_url, empresa_id, cuenta_id);

        // Guardar requisition_id en la cuenta bancaria
        await sb.from("cuentas_bancarias").update({
          nordigen_requisition_id: req_data.id,
          nordigen_conectado: false,
        }).eq("id", cuenta_id);

        result = { link: req_data.link, requisition_id: req_data.id };
        break;
      }

      case "status": {
        const { requisition_id, cuenta_id } = body;
        if (!requisition_id) throw new Error("Falta requisition_id");

        const reqData = await getRequisition(requisition_id);

        // Si está linked y tiene cuentas, guardar la primera
        if (reqData.status === "LN" && reqData.accounts?.length > 0) {
          const accId = reqData.accounts[0];
          await sb.from("cuentas_bancarias").update({
            nordigen_account_id: accId,
            nordigen_conectado: true,
          }).eq("id", cuenta_id);

          // Obtener detalles de la cuenta
          try {
            const details = await getAccountDetails(accId);
            const iban = details?.account?.iban;
            if (iban) {
              await sb.from("cuentas_bancarias").update({ iban }).eq("id", cuenta_id);
            }
          } catch (_) {}
        }

        result = {
          status: reqData.status,
          accounts: reqData.accounts || [],
          link: reqData.link,
        };
        break;
      }

      case "sync": {
        const { empresa_id, cuenta_id, nordigen_account_id } = body;
        if (!empresa_id || !cuenta_id || !nordigen_account_id) {
          throw new Error("Faltan parámetros para sincronizar");
        }
        result = await syncTransactions(sb, empresa_id, cuenta_id, nordigen_account_id);
        break;
      }

      case "disconnect": {
        const { cuenta_id, requisition_id } = body;
        if (requisition_id) {
          try { await deleteRequisition(requisition_id); } catch (_) {}
        }
        await sb.from("cuentas_bancarias").update({
          nordigen_requisition_id: null,
          nordigen_account_id: null,
          nordigen_conectado: false,
          nordigen_ultimo_sync: null,
        }).eq("id", cuenta_id);
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
