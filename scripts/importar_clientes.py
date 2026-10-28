"""Importa las listas de clientes ("BASE DE DATOS - CLIENTES.xlsx" y "CUADRO DE CLIENTES FM3.xlsx")
y escribe en stdout un SQL idempotente con clientes (marca + razón social + RUC) y sus sedes.

Cada hoja tiene una fila de encabezados (RAZON SOCIAL, RUC, CLIENTE, TIENDA/SEDES/CAMPUS/OFICINA, DIRECCIÓN…);
la razón social, el RUC y el cliente vienen solo en la primera fila de cada grupo y se arrastran hacia abajo.
Si la hoja no tiene columna CLIENTE/AGENCIA, el cliente es el nombre de la hoja.

Uso:
  python3 scripts/importar_clientes.py archivo1.xlsx [archivo2.xlsx …] > /tmp/clientes.sql
  psql "<conexión>" -v ON_ERROR_STOP=1 -1 -f /tmp/clientes.sql

Volver a ejecutarlo actualiza los datos de las sedes existentes (por cliente + nombre) sin borrar nada.
"""
import re
import sys
import unicodedata
import warnings
from collections import Counter, OrderedDict

import openpyxl

warnings.filterwarnings('ignore')

# Encabezado normalizado → campo
FIELDS = {
    'razon social': 'business_name', 'ruc': 'ruc',
    'cliente': 'client', 'agencia': 'client',
    'pe': 'code',
    'tienda': 'name', 'sedes': 'name', 'campus': 'name', 'oficina': 'name', 'agencia/tienda': 'name',
    'direccion': 'address', 'direccion comercial': 'address',
    'distrito': 'district', 'provincia': 'province',
}
# Nombres de cliente que se escriben distinto en el Excel
CLIENT_NAMES = {'REDINTER (REA)': 'REDINTER'}
# Direcciones que en realidad son notas
NOT_ADDRESS = re.compile(r'no publicada|confirmar con', re.I)


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r'\s+', ' ', str(v).replace('\xa0', ' ')).strip().strip(',').strip()
    return s or None


def q(v):
    return 'null' if v is None else "'" + str(v).replace("'", "''") + "'"


def read_sheet(ws):
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    head_i = next(i for i, r in enumerate(rows) if 'ruc' in [norm(v) for v in r])
    cols = {i: FIELDS[norm(v)] for i, v in enumerate(rows[head_i]) if norm(v) in FIELDS}
    body = [{f: clean(r[i]) if i < len(r) else None for i, f in cols.items()} for r in rows[head_i + 1:]]

    # Leyenda de prefijos al final de la hoja (Delosi): "BK - Burger King"
    brands = {}
    for r in body:
        m = re.match(r'^([A-Z]+)\s*-\s*(.+)$', r.get('client') or '')
        if m and not r.get('name'):
            brands[m.group(1)] = m.group(2).strip()

    sites, carry = [], {'business_name': None, 'ruc': None, 'client': None}
    for r in body:
        for k in carry:
            if r.get(k):
                carry[k] = r[k]
        name = r.get('name')
        if not name:
            continue  # filas vacías, leyenda o notas sueltas
        client = CLIENT_NAMES.get(carry['client'], carry['client']) if 'client' in cols.values() else ws.title.upper()
        code = r.get('code')
        # Delosi: la "tienda" es el código (BK076) → nombre con la marca de la leyenda
        m = re.match(r'^([A-Z]+)\d+$', name)
        if m and brands:
            code, name = name, f"{name} - {brands[m.group(1)]}" if m.group(1) in brands else name
        address = r.get('address')
        if address and (NOT_ADDRESS.search(address) or not re.search(r'[A-Za-z0-9]', address)):
            address = None
        sites.append({
            'client': client.upper(), 'business_name': carry['business_name'], 'ruc': carry['ruc'],
            'name': name, 'code': code, 'address': address,
            'district': (r.get('district') or '').upper() or None, 'province': (r.get('province') or '').upper() or None,
        })
    return sites


def main(paths):
    sites = []
    for p in paths:
        wb = openpyxl.load_workbook(p, data_only=True)
        for ws in wb.worksheets:
            sites += read_sheet(ws)

    # Filas repetidas tal cual (Delosi lista algunas tiendas dos veces): se omiten
    unique, rows = set(), []
    for s in sites:
        key = (s['client'], norm(s['name']), norm(s['address']))
        if key not in unique:
            unique.add(key)
            rows.append(s)
    sites = rows
    # Mismo nombre con otra dirección: se distinguen con un número (Independencia, Independencia 2)
    seen = Counter()
    for s in sites:
        key = (s['client'], norm(s['name']))
        seen[key] += 1
        if seen[key] > 1:
            s['name'] = f"{s['name']} {seen[key]}"

    clients = OrderedDict()
    for s in sites:
        clients.setdefault(s['client'], (s['business_name'], s['ruc']))

    out = ['-- Generado por scripts/importar_clientes.py']
    for name, (bn, ruc) in clients.items():
        out.append(
            f'insert into clients (name, business_name, ruc) values ({q(name)}, {q(bn)}, {q(ruc)}) '
            'on conflict (name) do update set business_name = excluded.business_name, ruc = excluded.ruc;')
    for s in sites:
        out.append(
            'insert into sites (client_id, name, code, address, district, province) '
            f"select id, {q(s['name'])}, {q(s['code'])}, {q(s['address'])}, {q(s['district'])}, {q(s['province'])} "
            f"from clients where name = {q(s['client'])} "
            'on conflict (client_id, name) do update set code = excluded.code, address = coalesce(excluded.address, sites.address), '
            'district = excluded.district, province = excluded.province;')
    print('\n'.join(out))
    per = Counter(s['client'] for s in sites)
    print(f'-- {len(clients)} clientes, {len(sites)} sedes: ' + ', '.join(f'{c} {n}' for c, n in per.items()), file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1:])
