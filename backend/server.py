"""
Cartera de Créditos - Backend API
FastAPI + MongoDB + JWT Auth (RBAC: admin / asesor)
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import random
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal

mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_TTL_MIN = 60 * 12  # 12 hours

app = FastAPI(title="Cartera de Créditos API")
api = APIRouter(prefix="/api")


# ============ Helpers ============
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_date_local(s: str) -> datetime:
    if len(s) == 10:
        s = s + "T00:00:00"
    if s.endswith("Z"):
        s = s[:-1]
    if "+" in s[10:]:
        s = s.split("+")[0]
    return datetime.fromisoformat(s)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_TTL_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(401, "No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("activo", True):
        raise HTTPException(401, "Usuario no encontrado o inactivo")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Solo el administrador puede realizar esta acción")
    return user


def op_number() -> str:
    return f"{random.randint(1000, 9999)}-{random.randint(100000, 999999)}"


def add_interval(d: datetime, frecuencia: str, count: int) -> datetime:
    if frecuencia == "Diario":
        return d + timedelta(days=count)
    if frecuencia == "Semanal":
        return d + timedelta(days=7 * count)
    if frecuencia == "Quincenal":
        return d + timedelta(days=15 * count)
    month = d.month - 1 + count
    year = d.year + month // 12
    month = month % 12 + 1
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    day = min(d.day, [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return d.replace(year=year, month=month, day=day)


# ============ Models ============
class Config(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nombre: str = "Mi Financiera"
    ruc: str = ""
    moneda: str = "S/"
    mora_diaria_pct: float = 0.0


class LoginIn(BaseModel):
    username: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class UserIn(BaseModel):
    username: str
    name: str
    password: str
    role: Literal["admin", "asesor"] = "asesor"

    @field_validator("username")
    @classmethod
    def _u(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if len(v) < 3:
            raise ValueError("Usuario debe tener al menos 3 caracteres")
        if not all(c.isalnum() or c in "._-" for c in v):
            raise ValueError("Usuario solo puede contener letras, números, . _ -")
        return v

    @field_validator("password")
    @classmethod
    def _p(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Contraseña mínima 6 caracteres")
        return v


class UserUpdate(BaseModel):
    name: Optional[str] = None
    activo: Optional[bool] = None
    role: Optional[Literal["admin", "asesor"]] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: str
    activo: bool = True
    creadoEn: str


class ClientIn(BaseModel):
    nombre: str
    dni: str = ""
    telefono: str = ""
    direccion: str = ""
    ocupacion: str = ""

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
    recordadoEn: Optional[str] = None


class CreditIn(BaseModel):
    clientId: str
    capital: float
    tasaInteres: float
    numCuotas: int
    frecuencia: Literal["Diario", "Semanal", "Quincenal", "Mensual"]
    fechaInicio: str


class Credit(BaseModel):
    id: str
    clientId: str
    asesorId: Optional[str] = None
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


class ReassignIn(BaseModel):
    asesorId: str


# ============ Startup ============
@app.on_event("startup")
async def _startup():
    await db.users.create_index("username", unique=True)
    await db.credits.create_index("asesorId")
    await seed_admin()


async def seed_admin():
    admin_user = os.environ.get("ADMIN_USERNAME", "admin").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"username": admin_user})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": admin_user,
            "name": "Administrador",
            "password_hash": hash_password(admin_pw),
            "role": "admin",
            "activo": True,
            "creadoEn": now_iso(),
        })
        logger.info("Admin creado: %s", admin_user)
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one(
            {"username": admin_user},
            {"$set": {"password_hash": hash_password(admin_pw), "activo": True, "role": "admin"}},
        )


async def get_config_doc() -> dict:
    doc = await db.config.find_one({"_id": "empresa"}, {"_id": 0})
    if not doc:
        default = Config().model_dump()
        await db.config.update_one({"_id": "empresa"}, {"$set": default}, upsert=True)
        return default
    return doc


# ============ AUTH ============
@api.post("/auth/login")
async def login(payload: LoginIn):
    u = (payload.username or "").strip().lower()
    user = await db.users.find_one({"username": u})
    if not user or not user.get("activo", True) or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    token = create_token(user["id"], user["username"], user["role"])
    return {
        "token": token,
        "user": {k: v for k, v in user.items() if k not in ("_id", "password_hash")},
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(payload.current_password, full["password_hash"]):
        raise HTTPException(400, "Contraseña actual incorrecta")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "La nueva contraseña debe tener al menos 6 caracteres")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(payload.new_password)}})
    return {"ok": True}


# ============ USERS (admin only) ============
@api.get("/users", response_model=List[UserOut])
async def list_users(admin: dict = Depends(require_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("username", 1).to_list(1000)
    return docs


@api.post("/users", response_model=UserOut)
async def create_user(payload: UserIn, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"username": payload.username})
    if existing:
        raise HTTPException(400, "Ya existe un usuario con ese nombre")
    doc = {
        "id": str(uuid.uuid4()),
        "username": payload.username,
        "name": payload.name.strip() or payload.username,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "activo": True,
        "creadoEn": now_iso(),
    }
    await db.users.insert_one(dict(doc))
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api.put("/users/{uid}", response_model=UserOut)
async def update_user(uid: str, payload: UserUpdate, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"id": uid})
    if not existing:
        raise HTTPException(404, "Usuario no encontrado")
    if existing["role"] == "admin" and payload.activo is False:
        raise HTTPException(400, "No puedes desactivar al administrador")
    updates: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.activo is not None:
        updates["activo"] = payload.activo
    if payload.role is not None:
        updates["role"] = payload.role
    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(400, "Contraseña mínima 6 caracteres")
        updates["password_hash"] = hash_password(payload.password)
    if updates:
        await db.users.update_one({"id": uid}, {"$set": updates})
    doc = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return doc


@api.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"id": uid})
    if not existing:
        raise HTTPException(404, "Usuario no encontrado")
    if existing["role"] == "admin":
        raise HTTPException(400, "No puedes eliminar al administrador")
    # Verificar si tiene créditos asignados
    count = await db.credits.count_documents({"asesorId": uid})
    if count:
        raise HTTPException(400, f"Este asesor tiene {count} crédito(s) asignados. Reasígnalos antes de eliminar.")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


# ============ CONFIG ============
@api.get("/config", response_model=Config)
async def get_config(user: dict = Depends(get_current_user)):
    return await get_config_doc()


@api.put("/config", response_model=Config)
async def update_config(cfg: Config, admin: dict = Depends(require_admin)):
    data = cfg.model_dump()
    await db.config.update_one({"_id": "empresa"}, {"$set": data}, upsert=True)
    return data


# ============ CLIENTS (compartidos entre asesores) ============
@api.get("/clients", response_model=List[Client])
async def list_clients(user: dict = Depends(get_current_user)):
    docs = await db.clients.find({}, {"_id": 0}).sort("nombre", 1).to_list(5000)
    return docs


@api.get("/clients/{cid}", response_model=Client)
async def get_client(cid: str, user: dict = Depends(get_current_user)):
    doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cliente no encontrado")
    return doc


@api.post("/clients", response_model=Client)
async def create_client(payload: ClientIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    data["id"] = str(uuid.uuid4())
    data["creadoEn"] = now_iso()
    await db.clients.insert_one(dict(data))
    return {k: v for k, v in data.items() if k != "_id"}


@api.put("/clients/{cid}", response_model=Client)
async def update_client(cid: str, payload: ClientIn, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Cliente no encontrado")
    data = payload.model_dump()
    await db.clients.update_one({"id": cid}, {"$set": data})
    existing.update(data)
    return existing


@api.delete("/clients/{cid}")
async def delete_client(cid: str, user: dict = Depends(get_current_user)):
    if user["role"] == "asesor":
        count = await db.credits.count_documents({"clientId": cid, "asesorId": {"$ne": user["id"]}})
        if count:
            raise HTTPException(403, "Este cliente tiene créditos asignados a otros asesores")
    count = await db.credits.count_documents({"clientId": cid})
    if count:
        raise HTTPException(400, "Este cliente tiene créditos registrados. Elimina primero sus créditos.")
    await db.clients.delete_one({"id": cid})
    return {"ok": True}


# ============ CREDITS ============
def credits_filter(user: dict) -> dict:
    if user["role"] == "asesor":
        return {"asesorId": user["id"]}
    return {}


@api.get("/credits", response_model=List[Credit])
async def list_credits(user: dict = Depends(get_current_user)):
    q = credits_filter(user)
    docs = await db.credits.find(q, {"_id": 0}).sort("creadoEn", -1).to_list(10000)
    return docs


@api.get("/credits/{crid}", response_model=Credit)
async def get_credit(crid: str, user: dict = Depends(get_current_user)):
    doc = await db.credits.find_one({"id": crid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Crédito no encontrado")
    if user["role"] == "asesor" and doc.get("asesorId") != user["id"]:
        raise HTTPException(403, "No tienes acceso a este crédito")
    return doc


@api.post("/credits", response_model=Credit)
async def create_credit(payload: CreditIn, user: dict = Depends(get_current_user)):
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
        "asesorId": user["id"],
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
async def delete_credit(crid: str, user: dict = Depends(get_current_user)):
    existing = await db.credits.find_one({"id": crid})
    if not existing:
        return {"ok": True}
    if user["role"] == "asesor" and existing.get("asesorId") != user["id"]:
        raise HTTPException(403, "No puedes eliminar créditos de otro asesor")
    await db.credits.delete_one({"id": crid})
    return {"ok": True}


@api.patch("/credits/{crid}/asesor", response_model=Credit)
async def reassign_credit(crid: str, payload: ReassignIn, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": payload.asesorId, "activo": True})
    if not target:
        raise HTTPException(400, "Asesor no válido")
    existing = await db.credits.find_one({"id": crid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Crédito no encontrado")
    await db.credits.update_one({"id": crid}, {"$set": {"asesorId": payload.asesorId}})
    existing["asesorId"] = payload.asesorId
    return existing


@api.post("/credits/{crid}/cuotas/{numero}/pagar", response_model=Credit)
async def pagar_cuota(crid: str, numero: int, pago: PagoIn, user: dict = Depends(get_current_user)):
    credit = await db.credits.find_one({"id": crid}, {"_id": 0})
    if not credit:
        raise HTTPException(404, "Crédito no encontrado")
    if user["role"] == "asesor" and credit.get("asesorId") != user["id"]:
        raise HTTPException(403, "No puedes registrar pagos de créditos de otro asesor")
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
            q["atendioPor"] = user["name"]
            updated = True
            break
    if not updated:
        raise HTTPException(404, "Cuota no encontrada")
    await db.credits.update_one({"id": crid}, {"$set": {"cuotas": credit["cuotas"]}})
    return credit


# ============ MORA ============
@api.get("/mora/preview")
async def mora_preview(creditId: str, numero: int, user: dict = Depends(get_current_user)):
    cfg = await get_config_doc()
    tasa = float(cfg.get("mora_diaria_pct", 0) or 0)
    credit = await db.credits.find_one({"id": creditId}, {"_id": 0})
    if not credit:
        raise HTTPException(404, "Crédito no encontrado")
    if user["role"] == "asesor" and credit.get("asesorId") != user["id"]:
        raise HTTPException(403, "Acceso denegado")
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


# ============ REMINDERS ============
@api.get("/reminders")
async def reminders(user: dict = Depends(get_current_user), asesorId: Optional[str] = None):
    """Cuotas pendientes agrupadas por vencidas / hoy / mañana / esta semana / futuro.
    - asesor: solo ve sus créditos
    - admin: ve todos; puede filtrar con ?asesorId=xxx
    """
    q: dict = {}
    if user["role"] == "asesor":
        q["asesorId"] = user["id"]
    elif asesorId:
        q["asesorId"] = asesorId

    credits = await db.credits.find(q, {"_id": 0}).to_list(10000)
    clients = {c["id"]: c async for c in db.clients.find({}, {"_id": 0})}
    users_map = {u["id"]: u async for u in db.users.find({}, {"_id": 0, "password_hash": 0})}

    hoy = datetime.now().date()
    manana = hoy + timedelta(days=1)
    fin_semana = hoy + timedelta(days=7)

    buckets = {"vencidas": [], "hoy": [], "manana": [], "semana": [], "futuro": []}
    for cr in credits:
        cl = clients.get(cr["clientId"], {})
        asr = users_map.get(cr.get("asesorId") or "", {})
        for c_ in cr["cuotas"]:
            if c_["estado"] == "Pagada":
                continue
            venc = parse_date_local(c_["fechaVencimiento"]).date()
            item = {
                "creditId": cr["id"],
                "numero": c_["numero"],
                "clientId": cr["clientId"],
                "cliente": cl.get("nombre", "—"),
                "telefono": cl.get("telefono", ""),
                "asesorId": cr.get("asesorId"),
                "asesor": asr.get("name", "—"),
                "fechaVencimiento": c_["fechaVencimiento"],
                "total": c_["total"],
                "dias": (hoy - venc).days,
                "recordadoEn": c_.get("recordadoEn"),
            }
            if venc < hoy:
                buckets["vencidas"].append(item)
            elif venc == hoy:
                buckets["hoy"].append(item)
            elif venc == manana:
                buckets["manana"].append(item)
            elif venc <= fin_semana:
                buckets["semana"].append(item)
            else:
                buckets["futuro"].append(item)

    for k in buckets:
        buckets[k].sort(key=lambda x: x["fechaVencimiento"])
    return buckets


class MarkReminderIn(BaseModel):
    creditId: str
    numero: int


@api.post("/reminders/mark")
async def mark_reminder(payload: MarkReminderIn, user: dict = Depends(get_current_user)):
    credit = await db.credits.find_one({"id": payload.creditId}, {"_id": 0})
    if not credit:
        raise HTTPException(404, "Crédito no encontrado")
    if user["role"] == "asesor" and credit.get("asesorId") != user["id"]:
        raise HTTPException(403, "Acceso denegado")
    for q in credit["cuotas"]:
        if q["numero"] == payload.numero:
            q["recordadoEn"] = now_iso()
            break
    await db.credits.update_one({"id": payload.creditId}, {"$set": {"cuotas": credit["cuotas"]}})
    return {"ok": True}


# ============ REPORTS ============
@api.get("/reports/cobranzas")
async def report_cobranzas(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    asesorId: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q: dict = {}
    if user["role"] == "asesor":
        q["asesorId"] = user["id"]
    elif asesorId:
        q["asesorId"] = asesorId

    credits = await db.credits.find(q, {"_id": 0}).to_list(10000)
    clients = {c["id"]: c async for c in db.clients.find({}, {"_id": 0})}
    users_map = {u["id"]: u async for u in db.users.find({}, {"_id": 0, "password_hash": 0})}

    d_ini = parse_date_local(desde).date() if desde else None
    d_fin = parse_date_local(hasta).date() if hasta else None

    rows = []
    total_capital = total_interes = total_mora = total = 0.0
    by_method: dict = {}
    by_operator: dict = {}

    for cr in credits:
        cl = clients.get(cr["clientId"], {})
        asr = users_map.get(cr.get("asesorId") or "", {})
        for q_ in cr["cuotas"]:
            if q_["estado"] != "Pagada" or not q_.get("fechaPago"):
                continue
            fp = parse_date_local(q_["fechaPago"]).date()
            if d_ini and fp < d_ini:
                continue
            if d_fin and fp > d_fin:
                continue
            rows.append({
                "fechaPago": q_["fechaPago"],
                "operacion": q_.get("operacion"),
                "cliente": cl.get("nombre", "—"),
                "creditId": cr["id"],
                "numero": q_["numero"],
                "capital": q_["capital"],
                "interes": q_["interes"],
                "mora": q_["mora"],
                "total": q_["total"],
                "metodoPago": q_.get("metodoPago"),
                "atendioPor": q_.get("atendioPor"),
                "asesor": asr.get("name", "—"),
            })
            total_capital += q_["capital"]
            total_interes += q_["interes"]
            total_mora += q_["mora"]
            total += q_["total"]
            m = q_.get("metodoPago") or "—"
            by_method[m] = by_method.get(m, 0) + q_["total"]
            op = q_.get("atendioPor") or "—"
            by_operator[op] = by_operator.get(op, 0) + q_["total"]

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


# ============ BACKUP ============
@api.get("/backup/export")
async def export_backup(admin: dict = Depends(require_admin)):
    clients = await db.clients.find({}, {"_id": 0}).to_list(10000)
    credits = await db.credits.find({}, {"_id": 0}).to_list(10000)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    cfg = await get_config_doc()
    return {
        "version": 2,
        "exportedAt": now_iso(),
        "config": cfg,
        "clients": clients,
        "credits": credits,
        "users": users,  # sin password_hash (informativo)
    }


class ImportPayload(BaseModel):
    version: int = 1
    config: Optional[Config] = None
    clients: List[dict] = []
    credits: List[dict] = []
    mode: Literal["merge", "replace"] = "merge"


@api.post("/backup/import")
async def import_backup(payload: ImportPayload, admin: dict = Depends(require_admin)):
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
