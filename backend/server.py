"""
Cartera de Créditos - Backend API
FastAPI + MongoDB
"""
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

app = FastAPI(title="Cartera de Créditos API")
api = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_date_local(s: str) -> datetime:
    """Parse ISO or YYYY-MM-DD string to datetime (naive, treated as local calendar date)."""
    if len(s) == 10:
        s = s + "T00:00:00"
    # Strip timezone if present, we treat all as local calendar dates
    if s.endswith("Z"):
        s = s[:-1]
    if "+" in s[10:]:
        s = s.split("+")[0]
    return datetime.fromisoformat(s)


# ============ MODELS ============
class Config(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nombre: str = "Mi Financiera"
    ruc: str = ""
    moneda: str = "S/"
    mora_diaria_pct: float = 0.0  # % diario sobre el total de la cuota, ej 0.5


class ClientIn(BaseModel):
    nombre: str
    dni: str = ""
    telefono: str = ""
    direccion: str = ""

    @field_validator("nombre")
    @classmethod
    def _nombre_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()

    @field_validator("dni")
    @classmethod
    def _dni_valid(cls, v: str) -> str:
        v = (v or "").strip()
        if v and (not v.isdigit() or len(v) != 8):
            raise ValueError("El DNI debe tener 8 dígitos numéricos")
        return v

    @field_validator("telefono")
    @classmethod
    def _tel_valid(cls, v: str) -> str:
        v = (v or "").strip()
        if v and (not v.isdigit() or len(v) != 9 or not v.startswith("9")):
            raise ValueError("El teléfono debe tener 9 dígitos y comenzar con 9")
        return v


class Client(ClientIn):
    id: str
    creadoEn: str


class Cuota(BaseModel):
    numero: int
    capital: float
    interes: float
    mora: float = 0.0
    total: float
    fechaVencimiento: str
    estado: Literal["Pendiente", "Pagada"] = "Pendiente"
    fechaPago: Optional[str] = None
    operacion: Optional[str] = None
    metodoPago: Optional[str] = None
    montoPagado: float = 0.0
    atendioPor: Optional[str] = None


class CreditIn(BaseModel):
    clientId: str
    capital: float
    tasaInteres: float
    numCuotas: int
    frecuencia: Literal["Diario", "Semanal", "Quincenal", "Mensual"]
    fechaInicio: str  # YYYY-MM-DD


class Credit(BaseModel):
    id: str
    clientId: str
    capital: float
    tasaInteres: float
    numCuotas: int
    frecuencia: str
    fechaInicio: str
    creadoEn: str
    cuotas: List[Cuota]


class PagoIn(BaseModel):
    capital: float
    interes: float
    mora: float = 0.0
    metodoPago: str
    atendioPor: str = ""


# ============ HELPERS ============
def add_interval(d: datetime, frecuencia: str, count: int) -> datetime:
    if frecuencia == "Diario":
        return d + timedelta(days=count)
    if frecuencia == "Semanal":
        return d + timedelta(days=7 * count)
    if frecuencia == "Quincenal":
        return d + timedelta(days=15 * count)
    # Mensual
    month = d.month - 1 + count
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return d.replace(year=year, month=month, day=day)


def op_number() -> str:
    import random
    return f"{random.randint(1000, 9999)}-{random.randint(100000, 999999)}"


async def get_config_doc() -> dict:
    doc = await db.config.find_one({"_id": "empresa"}, {"_id": 0})
    if not doc:
        default = Config().model_dump()
        await db.config.update_one({"_id": "empresa"}, {"$set": default}, upsert=True)
        return default
    return doc


# ============ ROUTES: CONFIG ============
@api.get("/config", response_model=Config)
async def get_config():
    return await get_config_doc()


@api.put("/config", response_model=Config)
async def update_config(cfg: Config):
    data = cfg.model_dump()
    await db.config.update_one({"_id": "empresa"}, {"$set": data}, upsert=True)
    return data


# ============ ROUTES: CLIENTS ============
@api.get("/clients", response_model=List[Client])
async def list_clients():
    docs = await db.clients.find({}, {"_id": 0}).sort("nombre", 1).to_list(5000)
    return docs


@api.get("/clients/{cid}", response_model=Client)
async def get_client(cid: str):
    doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cliente no encontrado")
    return doc


@api.post("/clients", response_model=Client)
async def create_client(payload: ClientIn):
    data = payload.model_dump()
    data["id"] = str(uuid.uuid4())
    data["creadoEn"] = now_iso()
    await db.clients.insert_one(dict(data))
    return {k: v for k, v in data.items() if k != "_id"}


@api.put("/clients/{cid}", response_model=Client)
async def update_client(cid: str, payload: ClientIn):
    existing = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Cliente no encontrado")
    data = payload.model_dump()
    await db.clients.update_one({"id": cid}, {"$set": data})
    existing.update(data)
    return existing


@api.delete("/clients/{cid}")
async def delete_client(cid: str):
    count = await db.credits.count_documents({"clientId": cid})
    if count:
        raise HTTPException(400, "Este cliente tiene créditos registrados. Elimina primero sus créditos.")
    await db.clients.delete_one({"id": cid})
    return {"ok": True}


# ============ ROUTES: CREDITS ============
@api.get("/credits", response_model=List[Credit])
async def list_credits():
    docs = await db.credits.find({}, {"_id": 0}).sort("creadoEn", -1).to_list(10000)
    return docs


@api.get("/credits/{crid}", response_model=Credit)
async def get_credit(crid: str):
    doc = await db.credits.find_one({"id": crid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Crédito no encontrado")
    return doc


@api.post("/credits", response_model=Credit)
async def create_credit(payload: CreditIn):
    cli = await db.clients.find_one({"id": payload.clientId})
    if not cli:
        raise HTTPException(400, "Cliente no válido")
    if payload.capital <= 0 or payload.numCuotas <= 0:
        raise HTTPException(400, "Capital y número de cuotas deben ser mayores a 0")

    interes_total = payload.capital * (payload.tasaInteres / 100.0)
    total_pagar = payload.capital + interes_total
    cuota_capital = payload.capital / payload.numCuotas
    cuota_interes = interes_total / payload.numCuotas
    cuota_total = total_pagar / payload.numCuotas

    inicio = parse_date_local(payload.fechaInicio)
    cuotas = []
    for i in range(1, payload.numCuotas + 1):
        venc = add_interval(inicio, payload.frecuencia, i)
        cuotas.append(Cuota(
            numero=i,
            capital=round(cuota_capital, 2),
            interes=round(cuota_interes, 2),
            mora=0.0,
            total=round(cuota_total, 2),
            fechaVencimiento=venc.isoformat(),
        ).model_dump())

    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "clientId": payload.clientId,
        "capital": payload.capital,
        "tasaInteres": payload.tasaInteres,
        "numCuotas": payload.numCuotas,
        "frecuencia": payload.frecuencia,
        "fechaInicio": payload.fechaInicio,
        "creadoEn": now_iso(),
        "cuotas": cuotas,
    }
    await db.credits.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.delete("/credits/{crid}")
async def delete_credit(crid: str):
    await db.credits.delete_one({"id": crid})
    return {"ok": True}


@api.post("/credits/{crid}/cuotas/{numero}/pagar", response_model=Credit)
async def pagar_cuota(crid: str, numero: int, pago: PagoIn):
    credit = await db.credits.find_one({"id": crid}, {"_id": 0})
    if not credit:
        raise HTTPException(404, "Crédito no encontrado")
    updated = False
    for q in credit["cuotas"]:
        if q["numero"] == numero:
            if q["estado"] == "Pagada":
                raise HTTPException(400, "La cuota ya fue pagada")
            q["capital"] = round(pago.capital, 2)
            q["interes"] = round(pago.interes, 2)
            q["mora"] = round(pago.mora, 2)
            q["total"] = round(pago.capital + pago.interes + pago.mora, 2)
            q["montoPagado"] = q["total"]
            q["estado"] = "Pagada"
            q["fechaPago"] = now_iso()
            q["operacion"] = op_number()
            q["metodoPago"] = pago.metodoPago
            q["atendioPor"] = pago.atendioPor or "No especificado"
            updated = True
            break
    if not updated:
        raise HTTPException(404, "Cuota no encontrada")
    await db.credits.update_one({"id": crid}, {"$set": {"cuotas": credit["cuotas"]}})
    return credit


# ============ ROUTES: MORA (cálculo automático) ============
@api.get("/mora/preview")
async def mora_preview(creditId: str, numero: int):
    """Calcula mora sugerida por días de atraso usando mora_diaria_pct del config."""
    cfg = await get_config_doc()
    tasa = float(cfg.get("mora_diaria_pct", 0) or 0)
    credit = await db.credits.find_one({"id": creditId}, {"_id": 0})
    if not credit:
        raise HTTPException(404, "Crédito no encontrado")
    q = next((x for x in credit["cuotas"] if x["numero"] == numero), None)
    if not q:
        raise HTTPException(404, "Cuota no encontrada")
    if q["estado"] == "Pagada":
        return {"dias": 0, "mora": 0.0, "tasa_diaria_pct": tasa}
    venc = parse_date_local(q["fechaVencimiento"])
    hoy = datetime.now()
    dias = max(0, (hoy.date() - venc.date()).days)
    base = q["capital"] + q["interes"]
    mora = round(base * (tasa / 100.0) * dias, 2)
    return {"dias": dias, "mora": mora, "tasa_diaria_pct": tasa}


# ============ ROUTES: REPORTS ============
@api.get("/reports/cobranzas")
async def report_cobranzas(desde: Optional[str] = None, hasta: Optional[str] = None):
    """Reporte de cobranzas en un rango de fechas (por fechaPago)."""
    credits = await db.credits.find({}, {"_id": 0}).to_list(10000)
    clients = {c["id"]: c async for c in db.clients.find({}, {"_id": 0})}

    d_ini = parse_date_local(desde).date() if desde else None
    d_fin = parse_date_local(hasta).date() if hasta else None

    rows = []
    total_capital = total_interes = total_mora = total = 0.0
    by_method: dict = {}
    by_operator: dict = {}

    for cr in credits:
        for q in cr["cuotas"]:
            if q["estado"] != "Pagada" or not q.get("fechaPago"):
                continue
            fp = parse_date_local(q["fechaPago"]).date()
            if d_ini and fp < d_ini:
                continue
            if d_fin and fp > d_fin:
                continue
            cli = clients.get(cr["clientId"], {})
            rows.append({
                "fechaPago": q["fechaPago"],
                "operacion": q.get("operacion"),
                "cliente": cli.get("nombre", "—"),
                "creditId": cr["id"],
                "numero": q["numero"],
                "capital": q["capital"],
                "interes": q["interes"],
                "mora": q["mora"],
                "total": q["total"],
                "metodoPago": q.get("metodoPago"),
                "atendioPor": q.get("atendioPor"),
            })
            total_capital += q["capital"]
            total_interes += q["interes"]
            total_mora += q["mora"]
            total += q["total"]
            by_method[q.get("metodoPago") or "—"] = by_method.get(q.get("metodoPago") or "—", 0) + q["total"]
            op = q.get("atendioPor") or "—"
            by_operator[op] = by_operator.get(op, 0) + q["total"]

    rows.sort(key=lambda r: r["fechaPago"], reverse=True)
    return {
        "rows": rows,
        "totales": {
            "capital": round(total_capital, 2),
            "interes": round(total_interes, 2),
            "mora": round(total_mora, 2),
            "total": round(total, 2),
            "cantidad": len(rows),
        },
        "porMetodo": [{"metodo": k, "total": round(v, 2)} for k, v in by_method.items()],
        "porOperador": [{"operador": k, "total": round(v, 2)} for k, v in by_operator.items()],
    }


# ============ ROUTES: EXPORT/IMPORT ============
@api.get("/backup/export")
async def export_backup():
    clients = await db.clients.find({}, {"_id": 0}).to_list(10000)
    credits = await db.credits.find({}, {"_id": 0}).to_list(10000)
    cfg = await get_config_doc()
    return {
        "version": 1,
        "exportedAt": now_iso(),
        "config": cfg,
        "clients": clients,
        "credits": credits,
    }


class ImportPayload(BaseModel):
    version: int = 1
    config: Optional[Config] = None
    clients: List[dict] = []
    credits: List[dict] = []
    mode: Literal["merge", "replace"] = "merge"


@api.post("/backup/import")
async def import_backup(payload: ImportPayload):
    if payload.mode == "replace":
        await db.clients.delete_many({})
        await db.credits.delete_many({})

    ins_clients = 0
    for c in payload.clients:
        c = {k: v for k, v in c.items() if k != "_id"}
        if not c.get("id"):
            c["id"] = str(uuid.uuid4())
        if not c.get("creadoEn"):
            c["creadoEn"] = now_iso()
        await db.clients.update_one({"id": c["id"]}, {"$set": c}, upsert=True)
        ins_clients += 1

    ins_credits = 0
    for cr in payload.credits:
        cr = {k: v for k, v in cr.items() if k != "_id"}
        if not cr.get("id"):
            cr["id"] = str(uuid.uuid4())
        if not cr.get("creadoEn"):
            cr["creadoEn"] = now_iso()
        await db.credits.update_one({"id": cr["id"]}, {"$set": cr}, upsert=True)
        ins_credits += 1

    if payload.config:
        await db.config.update_one({"_id": "empresa"}, {"$set": payload.config.model_dump()}, upsert=True)

    return {"ok": True, "clients": ins_clients, "credits": ins_credits}


@api.get("/")
async def root():
    return {"message": "Cartera de Créditos API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
