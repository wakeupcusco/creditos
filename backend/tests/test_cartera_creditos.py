"""
Backend regression tests for Cartera de Créditos API.
Covers: config, clients CRUD, credits CRUD, pagar cuota, mora preview, reports, backup export/import.
"""
import os
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-builder-156.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def state():
    return {}


# ---------- CONFIG ----------
class TestConfig:
    def test_get_config(self, session):
        r = session.get(f"{API}/config")
        assert r.status_code == 200
        data = r.json()
        assert "nombre" in data and "moneda" in data and "mora_diaria_pct" in data

    def test_update_config_persists(self, session):
        payload = {"nombre": "TEST_Financiera", "ruc": "20123456789", "moneda": "S/", "mora_diaria_pct": 0.5}
        r = session.put(f"{API}/config", json=payload)
        assert r.status_code == 200
        assert r.json()["nombre"] == "TEST_Financiera"
        assert r.json()["mora_diaria_pct"] == 0.5
        # GET verify persistence
        g = session.get(f"{API}/config").json()
        assert g["nombre"] == "TEST_Financiera"
        assert g["mora_diaria_pct"] == 0.5


# ---------- CLIENTS ----------
class TestClients:
    def test_create_client_valid(self, session, state):
        payload = {"nombre": "TEST_Juan Perez", "dni": "12345678", "telefono": "987654321", "direccion": "Av. Test 123"}
        r = session.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["nombre"] == "TEST_Juan Perez"
        assert data["dni"] == "12345678"
        assert data["telefono"] == "987654321"
        assert "id" in data
        state["client_id"] = data["id"]

    def test_get_client_persisted(self, session, state):
        r = session.get(f"{API}/clients/{state['client_id']}")
        assert r.status_code == 200
        assert r.json()["dni"] == "12345678"

    def test_list_clients(self, session, state):
        r = session.get(f"{API}/clients")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert state["client_id"] in ids

    def test_create_client_invalid_dni(self, session):
        r = session.post(f"{API}/clients", json={"nombre": "TEST_Bad", "dni": "12345"})
        assert r.status_code == 422

    def test_create_client_invalid_telefono(self, session):
        r = session.post(f"{API}/clients", json={"nombre": "TEST_Bad2", "telefono": "123456789"})
        assert r.status_code == 422

    def test_create_client_missing_nombre(self, session):
        r = session.post(f"{API}/clients", json={"nombre": ""})
        assert r.status_code == 422

    def test_update_client(self, session, state):
        r = session.put(f"{API}/clients/{state['client_id']}",
                        json={"nombre": "TEST_Juan Perez Editado", "dni": "12345678", "telefono": "987654321"})
        assert r.status_code == 200
        assert r.json()["nombre"] == "TEST_Juan Perez Editado"
        g = session.get(f"{API}/clients/{state['client_id']}").json()
        assert g["nombre"] == "TEST_Juan Perez Editado"


# ---------- CREDITS ----------
class TestCredits:
    def test_create_credit(self, session, state):
        payload = {
            "clientId": state["client_id"],
            "capital": 1200,
            "tasaInteres": 20,
            "numCuotas": 6,
            "frecuencia": "Mensual",
            "fechaInicio": date.today().isoformat(),
        }
        r = session.post(f"{API}/credits", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["capital"] == 1200
        assert len(data["cuotas"]) == 6
        # Cuota total = (1200 + 240) / 6 = 240.00
        assert data["cuotas"][0]["total"] == 240.0
        state["credit_id"] = data["id"]

    def test_credit_invalid_client(self, session):
        r = session.post(f"{API}/credits", json={
            "clientId": "nonexistent", "capital": 100, "tasaInteres": 10,
            "numCuotas": 2, "frecuencia": "Mensual", "fechaInicio": date.today().isoformat()
        })
        assert r.status_code == 400

    def test_credit_zero_capital(self, session, state):
        r = session.post(f"{API}/credits", json={
            "clientId": state["client_id"], "capital": 0, "tasaInteres": 10,
            "numCuotas": 2, "frecuencia": "Mensual", "fechaInicio": date.today().isoformat()
        })
        assert r.status_code == 400

    def test_get_credit(self, session, state):
        r = session.get(f"{API}/credits/{state['credit_id']}")
        assert r.status_code == 200
        assert len(r.json()["cuotas"]) == 6

    def test_pagar_cuota(self, session, state):
        r = session.post(f"{API}/credits/{state['credit_id']}/cuotas/1/pagar",
                         json={"capital": 200, "interes": 40, "mora": 0, "metodoPago": "Efectivo", "atendioPor": "TEST_Tester"})
        assert r.status_code == 200, r.text
        data = r.json()
        q1 = next(x for x in data["cuotas"] if x["numero"] == 1)
        assert q1["estado"] == "Pagada"
        assert q1["operacion"] is not None
        assert q1["metodoPago"] == "Efectivo"
        assert q1["total"] == 240.0

    def test_cannot_pay_twice(self, session, state):
        r = session.post(f"{API}/credits/{state['credit_id']}/cuotas/1/pagar",
                         json={"capital": 200, "interes": 40, "mora": 0, "metodoPago": "Efectivo"})
        assert r.status_code == 400


# ---------- MORA PREVIEW ----------
class TestMora:
    def test_mora_preview_no_atraso(self, session, state):
        r = session.get(f"{API}/mora/preview", params={"creditId": state["credit_id"], "numero": 2})
        assert r.status_code == 200
        data = r.json()
        assert "dias" in data and "mora" in data
        # Cuota #2 vence en el futuro => dias should be 0
        assert data["dias"] == 0

    def test_mora_preview_paid(self, session, state):
        r = session.get(f"{API}/mora/preview", params={"creditId": state["credit_id"], "numero": 1})
        assert r.status_code == 200
        assert r.json()["mora"] == 0.0


# ---------- REPORTS ----------
class TestReports:
    def test_cobranzas_report(self, session):
        today = date.today().isoformat()
        r = session.get(f"{API}/reports/cobranzas", params={"desde": today, "hasta": today})
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and "totales" in data
        # The payment we made should be there
        assert data["totales"]["cantidad"] >= 1
        assert data["totales"]["total"] >= 240.0
        assert len(data["porMetodo"]) >= 1


# ---------- BACKUP ----------
class TestBackup:
    def test_export_backup(self, session):
        r = session.get(f"{API}/backup/export")
        assert r.status_code == 200
        data = r.json()
        assert "clients" in data and "credits" in data and "config" in data
        assert data["version"] == 1
        assert isinstance(data["clients"], list)


# ---------- CLEANUP (delete order matters) ----------
class TestZCleanup:
    def test_cannot_delete_client_with_credits(self, session, state):
        r = session.delete(f"{API}/clients/{state['client_id']}")
        assert r.status_code == 400

    def test_delete_credit(self, session, state):
        r = session.delete(f"{API}/credits/{state['credit_id']}")
        assert r.status_code == 200
        g = session.get(f"{API}/credits/{state['credit_id']}")
        assert g.status_code == 404

    def test_delete_client(self, session, state):
        r = session.delete(f"{API}/clients/{state['client_id']}")
        assert r.status_code == 200
        g = session.get(f"{API}/clients/{state['client_id']}")
        assert g.status_code == 404

    def test_reset_config(self, session):
        session.put(f"{API}/config", json={"nombre": "Mi Financiera", "ruc": "", "moneda": "S/", "mora_diaria_pct": 0.0})
