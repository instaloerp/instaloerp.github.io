# FASE 1 — Modelo de Datos: Furgonetas + Consumo en Partes

## Estado actual (lo que ya existe)

| Tabla | Qué hace |
|-------|----------|
| `almacenes` | Almacenes con tipo: central, furgoneta, externo. Furgonetas ya tienen matrícula |
| `articulos` | Catálogo de productos con código, precio, familia, foto, stock_minimo |
| `stock` | Cantidad actual por artículo × almacén |
| `movimientos_stock` | Historial: tipo, cantidad anterior/nueva, motivo, usuario, fecha |
| `traspasos` | Movimientos entre almacenes con líneas y estados |
| `partes_trabajo` | Partes con materiales como JSON: [{articulo_id, nombre, cantidad, precio, total}] |

---

## Cambios necesarios

### 1. AMPLIAR tabla `stock`

Añadir columnas para distinguir tipos de stock en furgoneta:

```sql
ALTER TABLE stock ADD COLUMN IF NOT EXISTS stock_provisional DECIMAL DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS stock_reservado DECIMAL DEFAULT 0;
-- stock_disponible = cantidad + stock_provisional - stock_reservado (calculado, no columna)
```

- `cantidad` = stock real validado (ya existe)
- `stock_provisional` = material de OCR/albarán pendiente de validar, pero usable
- `stock_reservado` = material apartado para una obra/pedido específico
- **stock_disponible** = cantidad + stock_provisional - stock_reservado (se calcula en el frontend, no es columna)

### 2. NUEVA tabla `consumos_parte`

Reemplaza el JSON de materiales por una tabla real con trazabilidad completa:

```sql
CREATE TABLE consumos_parte (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  parte_id BIGINT NOT NULL REFERENCES partes_trabajo(id),
  articulo_id BIGINT NOT NULL REFERENCES articulos(id),
  
  -- Datos del artículo (desnormalizados para histórico)
  articulo_codigo TEXT,
  articulo_nombre TEXT,
  
  -- Cantidades
  cantidad DECIMAL NOT NULL,
  unidad TEXT,                        -- ud, kg, m, l
  
  -- Precios
  precio_unitario DECIMAL DEFAULT 0,
  total DECIMAL DEFAULT 0,
  
  -- Origen del material
  almacen_id BIGINT REFERENCES almacenes(id),  -- furgoneta de donde sale
  tipo_stock TEXT DEFAULT 'real',              -- 'real' | 'provisional'
  
  -- Tipo de consumo
  tipo TEXT DEFAULT 'consumo',               -- 'consumo' | 'merma' | 'rotura'
  motivo_merma TEXT,                          -- obligatorio si tipo = merma/rotura
  
  -- Flags
  sin_stock BOOLEAN DEFAULT FALSE,           -- TRUE = no había stock, genera incidencia
  facturable BOOLEAN DEFAULT TRUE,           -- FALSE si es merma/rotura
  
  -- Auditoría
  usuario_id UUID,
  usuario_nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_consumos_parte_id ON consumos_parte(parte_id);
CREATE INDEX idx_consumos_empresa ON consumos_parte(empresa_id);
CREATE INDEX idx_consumos_articulo ON consumos_parte(articulo_id);
```

### 3. NUEVA tabla `incidencias_stock`

Se crea automáticamente cuando el operario consume material sin stock:

```sql
CREATE TABLE incidencias_stock (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  
  -- Qué se consumió
  articulo_id BIGINT NOT NULL REFERENCES articulos(id),
  articulo_nombre TEXT,
  cantidad DECIMAL NOT NULL,
  
  -- Contexto
  almacen_id BIGINT REFERENCES almacenes(id),    -- furgoneta sin stock
  almacen_nombre TEXT,
  parte_id BIGINT REFERENCES partes_trabajo(id),
  parte_numero TEXT,
  
  -- Quién y cuándo
  usuario_id UUID,
  usuario_nombre TEXT,
  
  -- Gestión
  estado TEXT DEFAULT 'pendiente',   -- 'pendiente' | 'revisada' | 'resuelta'
  resolucion TEXT,                   -- notas de cómo se resolvió
  resuelta_por TEXT,
  resuelta_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidencias_empresa ON incidencias_stock(empresa_id);
CREATE INDEX idx_incidencias_estado ON incidencias_stock(estado);
```

### 4. AMPLIAR tabla `almacenes` (furgonetas)

Añadir campos para reposición automática (se usará en Fase 3, pero lo dejamos preparado):

```sql
ALTER TABLE almacenes ADD COLUMN IF NOT EXISTS operario_id UUID;
ALTER TABLE almacenes ADD COLUMN IF NOT EXISTS operario_nombre TEXT;
```

Así cada furgoneta queda vinculada a su operario habitual.

### 5. AMPLIAR tabla `movimientos_stock`

Añadir referencia al parte y al tipo de stock:

```sql
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS parte_id BIGINT;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS parte_numero TEXT;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS tipo_stock TEXT DEFAULT 'real';
-- tipo_stock: 'real' | 'provisional'
```

---

## Flujos operativos Fase 1

### FLUJO A: Operario añade material al parte

```
1. Operario abre parte en APP móvil
2. Pulsa "Añadir material"
3. Busca artículo (buscador / familias / QR / código)
4. Indica cantidad y unidad
5. Sistema busca stock en la furgoneta del operario:
   ├─ SI hay stock → descuenta de furgoneta, crea consumo_parte
   └─ NO hay stock → crea consumo_parte con sin_stock=TRUE
                      + crea incidencia_stock automática
6. En ambos casos: el parte se guarda correctamente
   → NUNCA se bloquea al operario
```

### FLUJO B: Merma o rotura

```
1. Operario en el parte → "Añadir merma/rotura"
2. Selecciona artículo y cantidad
3. Indica tipo (merma/rotura) y motivo obligatorio
4. Sistema:
   - Descuenta stock de furgoneta
   - Crea consumo_parte con tipo='merma'/'rotura', facturable=FALSE
   - Registra movimiento_stock
```

### FLUJO C: Vista de stock en furgoneta (APP)

```
1. Operario abre "Mi furgoneta" en la APP
2. Ve listado de artículos con:
   - Foto | Nombre | Stock real | Stock provisional | Disponible | Unidad
3. Puede filtrar por familia o buscar
4. Puede ver historial de movimientos de cada artículo
```

---

## Compatibilidad

### ¿Se rompe algo existente?

**NO.** Los cambios son 100% aditivos:
- Las columnas nuevas en `stock` tienen DEFAULT 0 → no afectan datos existentes
- La tabla `consumos_parte` es nueva → coexiste con el JSON de materiales
- La tabla `incidencias_stock` es nueva → no interfiere con nada
- Los campos en `almacenes` son opcionales (NULL por defecto)

### Migración de datos

- Los partes existentes siguen usando `materiales` (JSON)
- Los partes nuevos usarán `consumos_parte` (tabla) + seguirán guardando JSON como backup
- Transición progresiva, sin ruptura

---

## Resumen de cambios

| Acción | Tabla | Detalle |
|--------|-------|---------|
| MODIFICAR | `stock` | +stock_provisional, +stock_reservado |
| MODIFICAR | `almacenes` | +operario_id, +operario_nombre |
| MODIFICAR | `movimientos_stock` | +parte_id, +parte_numero, +tipo_stock |
| CREAR | `consumos_parte` | Consumo detallado por línea de parte |
| CREAR | `incidencias_stock` | Alertas automáticas por consumo sin stock |
