# -*- coding: utf-8 -*-
"""
Database bridge for CafePro POS preview server.
Connects directly to the real SQLite database photostudio.db in %APPDATA%/cafepro-system.
Handles queries, commands, invoice creation, invoice sequence generation, and table states via stdin/stdout JSON-RPC.
"""
import sys
import json
import sqlite3
import os
from datetime import datetime
try:
    import bcrypt
except ImportError:
    bcrypt = None

# Enforce UTF-8 unconditionally on Windows
if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

db_path = os.path.join(os.environ.get('APPDATA', ''), 'cafepro-system', 'photostudio.db')
if not os.path.exists(db_path):
    alt_path = os.path.join(os.path.dirname(__file__), '..', 'photostudio.db')
    if os.path.exists(alt_path):
        db_path = alt_path

conn = sqlite3.connect(db_path, timeout=20.0)
conn.row_factory = sqlite3.Row

current_session = {
    'userId': None,
    'employeeId': None,
    'employeeName': None,
    'username': None,
    'role': None,
    'shiftId': None
}

def auth_login(username, password):
    global current_session
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.employee_id, u.username, u.password_hash, u.role, u.is_active,
               e.name as employee_name
        FROM users u
        LEFT JOIN employees e ON e.id = u.employee_id
        WHERE u.username = ? AND u.is_active = 1
    """, (username,))
    user = cur.fetchone()
    if not user:
        return {'success': False, 'error': 'اسم المستخدم غير موجود أو الحساب غير نشط'}
    user_dict = dict(user)

    password_bytes = password.encode('utf-8')
    stored_hash = user_dict['password_hash'].encode('utf-8')
    valid = False
    try:
        valid = bcrypt.checkpw(password_bytes, stored_hash)
    except Exception:
        valid = (user_dict['password_hash'] == password)

    if not valid:
        return {'success': False, 'error': 'كلمة المرور غير صحيحة'}

    cur.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user_dict['id'],))

    # Check for active open shift
    cur.execute("SELECT id FROM shifts WHERE user_id = ? AND status = 'مفتوح' ORDER BY id DESC LIMIT 1", (user_dict['id'],))
    shift = cur.fetchone()
    shift_id = shift['id'] if shift else None

    # Check if cashier has strict role
    role = user_dict.get('role', 'cashier')

    current_session = {
        'userId': user_dict['id'],
        'employeeId': user_dict.get('employee_id') or user_dict['id'],
        'employeeName': user_dict.get('employee_name') or (username if username != 'admin' else 'مدير النظام'),
        'username': user_dict['username'],
        'role': role,
        'shiftId': shift_id
    }
    conn.commit()
    return {'success': True, 'data': current_session}

def auth_session():
    global current_session
    if current_session.get('userId'):
        return {'success': True, 'data': current_session}
    return {'success': False, 'error': 'لا توجد جلسة نشطة'}

def auth_logout():
    global current_session
    current_session = {
        'userId': None,
        'employeeId': None,
        'employeeName': None,
        'username': None,
        'role': None,
        'shiftId': None
    }
    return {'success': True}

def verify_admin_password(password):
    cur = conn.cursor()
    cur.execute("SELECT password_hash FROM users WHERE role = 'admin' AND is_active = 1")
    admins = cur.fetchall()
    password_bytes = password.encode('utf-8')
    for admin in admins:
        stored = admin['password_hash'].encode('utf-8')
        try:
            if bcrypt.checkpw(password_bytes, stored):
                return {'success': True}
        except Exception:
            if admin['password_hash'] == password:
                return {'success': True}
    return {'success': False, 'error': 'كلمة مرور المدير غير صحيحة'}

conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = ON")
conn.execute("PRAGMA journal_mode = WAL")

def init_qr_schema():
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS qr_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_number TEXT UNIQUE,
                table_id INTEGER REFERENCES tables(id),
                table_name TEXT,
                customer_name TEXT,
                customer_phone TEXT,
                notes TEXT,
                subtotal REAL DEFAULT 0,
                tax REAL DEFAULT 0,
                total REAL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                rejection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS qr_order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER REFERENCES qr_orders(id) ON DELETE CASCADE,
                service_id INTEGER REFERENCES services(id),
                service_name TEXT NOT NULL,
                price REAL NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                total REAL NOT NULL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Add QR & multi-tenant columns to company_settings
        qr_cols = [
            ("enable_qr_menu", "INTEGER DEFAULT 1"),
            ("qr_store_slug", "TEXT DEFAULT 'cafe-pro'"),
            ("qr_service_mode", "TEXT DEFAULT 'order'"),
            ("qr_cloud_url", "TEXT DEFAULT ''")
        ]
        for col, ctype in qr_cols:
            try:
                conn.execute(f"ALTER TABLE company_settings ADD COLUMN {col} {ctype}")
            except Exception:
                pass
        conn.commit()
    except Exception as e:
        sys.stderr.write(f"[QR Schema Init Warning]: {e}\n")

init_qr_schema()

def qr_menu_get_data():
    cur = conn.cursor()
    # 1. Categories
    cur.execute("SELECT id, name FROM service_categories ORDER BY id ASC")
    categories = [dict(r) for r in cur.fetchall()]

    # 2. Services / Menu Items
    cur.execute("""
        SELECT s.id, s.category_id, s.name, s.barcode, s.sell_price, s.image,
               s.track_inventory, s.quantity, s.is_taxable,
               c.name as category_name
        FROM services s
        LEFT JOIN service_categories c ON c.id = s.category_id
        ORDER BY s.category_id ASC, s.name ASC
    """)
    services = [dict(r) for r in cur.fetchall()]

    # 3. Active Tables
    cur.execute("SELECT id, name, section, seats, status FROM tables WHERE is_active = 1 ORDER BY id ASC")
    tables = [dict(r) for r in cur.fetchall()]

    # 4. Settings (Tax, Service Charge, Info)
    cur.execute("""
        SELECT company_name, logo_path, phone, address, currency,
               tax_enabled, tax_rate, tax_type, tax_exempt_takeaway,
               service_charge_enabled, service_charge_rate
        FROM company_settings WHERE id = 1
    """)
    set_row = cur.fetchone()
    settings = dict(set_row) if set_row else {'company_name': 'كافيه ومطعم برو'}

    return {
        'success': True,
        'data': {
            'categories': categories,
            'services': services,
            'tables': tables,
            'settings': settings
        }
    }

def qr_menu_submit_order(data):
    cur = conn.cursor()
    table_id = data.get('table_id')
    table_name = (data.get('table_name') or '').strip()

    # Safely validate table_id against tables table
    if table_id:
        try:
            cur.execute("SELECT id, name FROM tables WHERE id = ?", (table_id,))
            tbl = cur.fetchone()
            if tbl:
                table_id = tbl['id']
                if not table_name:
                    table_name = tbl['name']
            else:
                table_id = None
        except Exception:
            table_id = None

    if not table_name and table_id:
        table_name = f"ترابيزة {table_id}"
    elif not table_name:
        table_name = "صالة عامة / تيك أواي"

    customer_name = (data.get('customer_name') or 'عميل ترابيزة').strip()
    customer_phone = (data.get('customer_phone') or '').strip()
    notes = (data.get('notes') or '').strip()
    items = data.get('items', [])
    if not items:
        return {'success': False, 'error': 'سلة الطلبات فارغة'}

    cur.execute("SELECT COUNT(*) as cnt FROM qr_orders")
    cnt = (cur.fetchone()['cnt'] or 0) + 1
    order_number = f"QR-{cnt:04d}"

    subtotal = 0.0
    for it in items:
        subtotal += float(it.get('price', 0) or 0) * int(it.get('quantity', 1) or 1)

    total = subtotal

    cur.execute("""
        INSERT INTO qr_orders (order_number, table_id, table_name, customer_name, customer_phone, notes, subtotal, total, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    """, (order_number, table_id, table_name, customer_name, customer_phone, notes, subtotal, total))
    
    order_id = cur.lastrowid

    for it in items:
        raw_s_id = it.get('service_id') or it.get('id')
        s_id = None
        if raw_s_id:
            try:
                cur.execute("SELECT id FROM services WHERE id = ?", (raw_s_id,))
                if cur.fetchone():
                    s_id = raw_s_id
            except Exception:
                s_id = None

        s_name = it.get('service_name') or it.get('name') or 'صنف'
        price = float(it.get('price', 0) or 0)
        qty = int(it.get('quantity', 1) or 1)
        it_total = price * qty
        it_notes = (it.get('notes') or '').strip()

        cur.execute("""
            INSERT INTO qr_order_items (order_id, service_id, service_name, price, quantity, total, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (order_id, s_id, s_name, price, qty, it_total, it_notes))

    conn.commit()
    return {
        'success': True,
        'order_id': order_id,
        'order_number': order_number,
        'total': total,
        'table_name': table_name
    }

def qr_menu_get_order_status(order_id):
    cur = conn.cursor()
    cur.execute("SELECT * FROM qr_orders WHERE id = ?", (order_id,))
    ord_row = cur.fetchone()
    if not ord_row:
        return {'success': False, 'error': 'الطلب غير موجود'}
    order = dict(ord_row)

    cur.execute("SELECT * FROM qr_order_items WHERE order_id = ?", (order_id,))
    order['items'] = [dict(r) for r in cur.fetchall()]

    return {'success': True, 'data': order}

def qr_orders_get_pending():
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM qr_orders 
        WHERE status = 'pending' 
        ORDER BY id DESC
    """)
    orders = [dict(r) for r in cur.fetchall()]
    for o in orders:
        cur.execute("SELECT * FROM qr_order_items WHERE order_id = ?", (o['id'],))
        o['items'] = [dict(r) for r in cur.fetchall()]
    return {'success': True, 'data': orders}

def qr_orders_approve(order_id):
    cur = conn.cursor()
    cur.execute("SELECT * FROM qr_orders WHERE id = ?", (order_id,))
    order = cur.fetchone()
    if not order:
        return {'success': False, 'error': 'الطلب غير موجود'}
    order = dict(order)

    cur.execute("UPDATE qr_orders SET status = 'approved', updated_at = datetime('now') WHERE id = ?", (order_id,))
    order['status'] = 'approved'

    if order.get('table_id'):
        cur.execute("UPDATE tables SET status = 'مشغولة' WHERE id = ? AND status = 'فاضية'", (order['table_id'],))

    conn.commit()

    cur.execute("SELECT * FROM qr_order_items WHERE order_id = ?", (order_id,))
    order['items'] = [dict(r) for r in cur.fetchall()]

    return {'success': True, 'data': order}

def qr_orders_reject(order_id, reason=""):
    cur = conn.cursor()
    cur.execute("UPDATE qr_orders SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now') WHERE id = ?", (reason or 'اعتذار الكاشير عن الطلب', order_id))
    conn.commit()
    return {'success': True}

def qr_orders_update_status(order_id, status):
    cur = conn.cursor()
    cur.execute("UPDATE qr_orders SET status = ?, updated_at = datetime('now') WHERE id = ?", (status, order_id))
    conn.commit()
    cur.execute("SELECT * FROM qr_orders WHERE id = ?", (order_id,))
    row = cur.fetchone()
    return {'success': True, 'data': dict(row) if row else None}

def update_company_settings(data):
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(company_settings)")
    valid_cols = set(r['name'] for r in cur.fetchall())
    set_clauses = []
    values = []
    for k, v in data.items():
        if k in valid_cols and k != 'id':
            set_clauses.append(f"{k} = ?")
            values.append(v)
    if set_clauses:
        cur.execute(f"UPDATE company_settings SET {', '.join(set_clauses)} WHERE id = 1", values)
        conn.commit()
    return {'success': True}

def preview_invoice_number():
    now = datetime.now()
    year = now.year
    month = now.month
    month_str = f"{month:02d}"

    try:
        conn.execute("ALTER TABLE invoice_sequence ADD COLUMN month INTEGER DEFAULT 1")
        conn.commit()
    except Exception:
        pass

    cur = conn.cursor()
    cur.execute("SELECT * FROM invoice_sequence WHERE id = 1")
    row = cur.fetchone()
    
    last_num = 0
    if row:
        row_dict = dict(row)
        if row_dict.get('year') == year and row_dict.get('month') == month:
            last_num = row_dict.get('last_number', 0) or 0

    next_num = last_num
    while True:
        next_num += 1
        candidate = f"{next_num:04d}"
        cur.execute("""
            SELECT id FROM invoices 
            WHERE invoice_number = ? 
              AND (strftime('%Y', invoice_date) = ? AND strftime('%m', invoice_date) = ?)
        """, (candidate, str(year), month_str))
        if not cur.fetchone():
            return candidate


def save_invoice(invoice_data, items):
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    cur = conn.cursor()

    is_update = bool(invoice_data.get('id') or invoice_data.get('invoiceId'))
    invoice_id = invoice_data.get('id') or invoice_data.get('invoiceId')

    # Calculate driver earning if delivery
    driver_earning = 0
    driver_id = invoice_data.get('driver_id')
    delivery_status = invoice_data.get('delivery_status')
    delivery_fee = float(invoice_data.get('delivery_fee', 0) or 0)
    if driver_id and delivery_status == 'تم التسليم':
        cur.execute("SELECT delivery_fee_type, delivery_fee_value FROM employees WHERE id = ?", (driver_id,))
        drv = cur.fetchone()
        if drv:
            drv = dict(drv)
            if drv.get('delivery_fee_type') == 'نسبة':
                driver_earning = (delivery_fee * float(drv.get('delivery_fee_value', 0) or 0)) / 100.0
            else:
                driver_earning = float(drv.get('delivery_fee_value', 0) or 0)
    elif invoice_data.get('driver_earning'):
        driver_earning = float(invoice_data.get('driver_earning', 0) or 0)

    amount_paid = float(invoice_data.get('amount_paid', 0) or 0)
    remaining = float(invoice_data.get('remaining', 0) or 0)
    inv_status = invoice_data.get('status')
    if not inv_status:
        inv_status = 'محاسَبة' if (remaining <= 0 and amount_paid > 0) else 'مفتوحة'

    if is_update:
        cur.execute("SELECT invoice_number FROM invoices WHERE id = ?", (invoice_id,))
        existing = cur.fetchone()
        if not existing:
            raise Exception(f"Invoice {invoice_id} not found")
        inv_num = existing['invoice_number']

        cur.execute("DELETE FROM invoice_items WHERE invoice_id = ?", (invoice_id,))
        cur.execute("""
            UPDATE invoices SET
                customer_id = ?, employee_id = ?, table_id = ?, driver_id = ?,
                delivery_status = ?, delivery_fee = ?, driver_earning = ?, invoice_date = ?,
                payment_method = ?, invoice_type = ?, treasury_type = ?, subtotal = ?,
                discount_percent = ?, discount_amount = ?, net_total = ?, amount_paid = ?,
                remaining = ?, notes = ?, status = ?, order_type = ?,
                tax_rate = ?, tax_amount = ?, service_rate = ?, service_amount = ?
            WHERE id = ?
        """, (
            invoice_data.get('customer_id'),
            invoice_data.get('employee_id'),
            invoice_data.get('table_id'),
            driver_id,
            delivery_status,
            delivery_fee,
            driver_earning,
            invoice_data.get('invoice_date') or today_str,
            invoice_data.get('payment_method') or 'نقدي',
            invoice_data.get('invoice_type'),
            invoice_data.get('treasury_type') or 'الخزينة',
            float(invoice_data.get('subtotal', 0) or 0),
            float(invoice_data.get('discount_percent', 0) or 0),
            float(invoice_data.get('discount_amount', 0) or 0),
            float(invoice_data.get('net_total', 0) or 0),
            amount_paid,
            remaining,
            invoice_data.get('notes'),
            inv_status,
            invoice_data.get('order_type') or 'صالة',
            float(invoice_data.get('tax_rate', 0) or 0),
            float(invoice_data.get('tax_amount', 0) or 0),
            float(invoice_data.get('service_rate', 0) or 0),
            float(invoice_data.get('service_amount', 0) or 0),
            invoice_id
        ))
    else:
        inv_num = invoice_data.get('invoiceNumber') or preview_invoice_number()
        cur.execute("""
            INSERT INTO invoices (
                invoice_number, customer_id, employee_id, table_id, driver_id,
                delivery_status, delivery_fee, driver_earning, invoice_date,
                payment_method, invoice_type, treasury_type, subtotal, discount_percent,
                discount_amount, net_total, amount_paid, remaining, notes, status,
                order_type, tax_rate, tax_amount, service_rate, service_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            inv_num,
            invoice_data.get('customer_id'),
            invoice_data.get('employee_id'),
            invoice_data.get('table_id'),
            driver_id,
            delivery_status,
            delivery_fee,
            driver_earning,
            invoice_data.get('invoice_date') or today_str,
            invoice_data.get('payment_method') or 'نقدي',
            invoice_data.get('invoice_type'),
            invoice_data.get('treasury_type') or 'الخزينة',
            float(invoice_data.get('subtotal', 0) or 0),
            float(invoice_data.get('discount_percent', 0) or 0),
            float(invoice_data.get('discount_amount', 0) or 0),
            float(invoice_data.get('net_total', 0) or 0),
            amount_paid,
            remaining,
            invoice_data.get('notes'),
            inv_status,
            invoice_data.get('order_type') or 'صالة',
            float(invoice_data.get('tax_rate', 0) or 0),
            float(invoice_data.get('tax_amount', 0) or 0),
            float(invoice_data.get('service_rate', 0) or 0),
            float(invoice_data.get('service_amount', 0) or 0)
        ))
        invoice_id = cur.lastrowid
        cur.execute("UPDATE invoice_sequence SET last_number = last_number + 1, year = ?, month = ? WHERE id = 1", (now.year, now.month))

    # Insert items
    for it in (items or []):
        cur.execute("""
            INSERT INTO invoice_items (
                invoice_id, service_id, category_name, service_name,
                barcode, sell_price, quantity, item_discount, total, notes, sent_qty, size_name, recipe_ratio
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            invoice_id,
            it.get('service_id'),
            it.get('category_name') or '',
            it.get('service_name') or '',
            it.get('barcode'),
            float(it.get('sell_price', 0) or 0),
            float(it.get('quantity', 1) or 1),
            float(it.get('item_discount', 0) or 0),
            float(it.get('total', 0) or 0),
            it.get('notes') or '',
            int(it.get('sent_qty', 0) or 0),
            it.get('size_name'),
            float(it.get('recipe_ratio', 1.0) or 1.0)
        ))

    # Update table status
    tbl_id = invoice_data.get('table_id')
    if tbl_id:
        if inv_status in ('محاسَبة', 'مرتجع'):
            cur.execute("UPDATE tables SET status = 'فاضية' WHERE id = ?", (tbl_id,))
        else:
            cur.execute("UPDATE tables SET status = 'مشغولة' WHERE id = ?", (tbl_id,))

    # Update customer balance if debt
    cust_id = invoice_data.get('customer_id')
    if cust_id and (remaining > 0 or invoice_data.get('payment_method') == 'أجل'):
        cur.execute("UPDATE customers SET current_balance = current_balance + ? WHERE id = ?", (remaining, cust_id))

    # Add treasury entry
    t_type = invoice_data.get('treasury_type') or 'الخزينة'
    if amount_paid > 0 and not is_update:
        cur.execute("SELECT balance_after FROM treasury WHERE treasury_type = ? ORDER BY id DESC LIMIT 1", (t_type,))
        row_t = cur.fetchone()
        cur_bal = float(row_t['balance_after']) if row_t else 0.0
        new_bal = cur_bal + amount_paid
        t_time = now.strftime('%H:%M:%S')
        cur.execute("""
            INSERT INTO treasury (type, description, amount, balance_after, treasury_type, date, time)
            VALUES ('إيراد', ?, ?, ?, ?, ?, ?)
        """, (f"فاتورة رقم {inv_num}", amount_paid, new_bal, t_type, today_str, t_time))

    conn.commit()
    return {'invoiceId': invoice_id, 'invoiceNumber': inv_num}


def get_daily_report(date_str):
    import re
    cur = conn.cursor()
    date_like = f"{date_str}%"

    # 1. Invoices
    cur.execute("""
      SELECT i.*, c.name as customer_name, e.name as employee_name,
             COALESCE(i.amount_paid,0) as paid,
             COALESCE(i.remaining,0) as remaining_amount
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN employees e ON i.employee_id = e.id
      WHERE i.invoice_date LIKE ?
      ORDER BY i.id DESC
    """, (date_like,))
    invoices = [dict(r) for r in cur.fetchall()]

    # 2. Today's treasury movements on old invoices
    cur.execute("SELECT * FROM treasury WHERE date LIKE ? AND type='إيراد' ORDER BY time ASC", (date_like,))
    today_treasury = [dict(r) for r in cur.fetchall()]
    today_inv_numbers = set(i['invoice_number'] for i in invoices if i.get('invoice_number'))
    today_payments_on_old_invoices = []

    for tr in today_treasury:
        desc = tr.get('description') or ''
        m = re.search(r'(?:فاتورة|invoice)\s*(?:رقم\s*)?([A-Za-z0-9_-]+)', desc, re.I)
        if m:
            inv_num = m.group(1)
            if inv_num not in today_inv_numbers:
                cur.execute("SELECT i.*, c.name as customer_name, c.phone as customer_phone FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.invoice_number = ?", (inv_num,))
                old_inv = cur.fetchone()
                if old_inv:
                    today_payments_on_old_invoices.append({
                        'treasury_row': tr,
                        'invoice': dict(old_inv),
                        'invoice_number': inv_num
                    })

    # 3. Expenses
    try:
        cur.execute("SELECT * FROM expenses WHERE date LIKE ? ORDER BY id DESC", (date_like,))
        expenses = [dict(r) for r in cur.fetchall()]
    except Exception:
        expenses = []

    # 4. Advances
    try:
        cur.execute("""
          SELECT a.*, e.name as emp_name 
          FROM advances a 
          LEFT JOIN employees e ON a.employee_id = e.id 
          WHERE a.date LIKE ?
          ORDER BY a.id DESC
        """, (date_like,))
        advances = [dict(r) for r in cur.fetchall()]
    except Exception:
        advances = []

    # 5. Attendance
    try:
        cur.execute("""
          SELECT a.*, e.name as emp_name, e.salary_type 
          FROM attendance a 
          LEFT JOIN employees e ON a.employee_id = e.id 
          WHERE a.date LIKE ?
          ORDER BY a.id DESC
        """, (date_like,))
        attendance = [dict(r) for r in cur.fetchall()]
    except Exception:
        attendance = []

    # 6. Returns
    try:
        cur.execute("""
          SELECT r.*, i.invoice_number, c.name as customer_name
          FROM returns r
          LEFT JOIN invoices i ON r.original_invoice_id = i.id
          LEFT JOIN customers c ON i.customer_id = c.id
          WHERE r.return_date LIKE ?
          ORDER BY r.id DESC
        """, (date_like,))
        returns = [dict(r) for r in cur.fetchall()]
    except Exception:
        returns = []

    # 7. Treasury
    try:
        cur.execute("SELECT * FROM treasury WHERE date LIKE ? ORDER BY time ASC", (date_like,))
        treasury = [dict(r) for r in cur.fetchall()]
    except Exception:
        treasury = []

    # 8. Salaries
    try:
        cur.execute("""
          SELECT s.*, e.name as emp_name
          FROM salary_payments s
          LEFT JOIN employees e ON s.employee_id = e.id
          WHERE s.paid_date LIKE ?
          ORDER BY s.id DESC
        """, (date_like,))
        salaries = [dict(r) for r in cur.fetchall()]
    except Exception:
        salaries = []

    # 9. Revenues
    try:
        cur.execute("SELECT * FROM revenues WHERE date LIKE ? ORDER BY id DESC", (date_like,))
        revenues = [dict(r) for r in cur.fetchall()]
    except Exception:
        revenues = []

    # Summary
    today_old_payments_total = sum(float(p['treasury_row'].get('amount', 0) or 0) for p in today_payments_on_old_invoices)
    invoices_paid = sum(float(i.get('paid', 0) or 0) for i in invoices)
    revenues_total = sum(float(r.get('amount', 0) or 0) for r in revenues)
    expenses_total = sum(float(e.get('amount', 0) or 0) for e in expenses)
    returns_total = sum(float(r.get('total_returned', 0) or 0) for r in returns)
    advances_total = sum(float(a.get('amount', 0) or 0) for a in advances)
    salaries_total = sum(float(s.get('net_salary', 0) or 0) for s in salaries)

    summary = {
        'invoices_paid': invoices_paid + today_old_payments_total,
        'revenues': revenues_total,
        'expenses': expenses_total,
        'returns': returns_total,
        'advances': advances_total,
        'salaries': salaries_total
    }

    all_types = ['الخزينة', 'فودافون كاش', 'إنستا باي', 'فيزا']
    treasury_balances = []
    for t in all_types:
        try:
            cur.execute("""
                SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END), 0) as net
                FROM treasury WHERE date LIKE ? AND treasury_type = ?
            """, (date_like, t))
            row = cur.fetchone()
            treasury_balances.append({
                'treasury_type': t,
                'balance': float(row['net']) if row else 0.0
            })
        except Exception:
            treasury_balances.append({'treasury_type': t, 'balance': 0.0})

    return {
        'summary': summary,
        'treasuryBalances': treasury_balances,
        'invoices': invoices,
        'expenses': expenses,
        'advances': advances,
        'attendance': attendance,
        'returns': returns,
        'treasury': treasury,
        'salaries': salaries,
        'revenues': revenues,
        'todayPaymentsOnOldInvoices': today_payments_on_old_invoices
    }


def main():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            action = req.get('action')
            sql = req.get('sql', '')
            params = req.get('params', [])

            cur = conn.cursor()

            if action == 'query':
                cur.execute(sql, params)
                rows = [dict(r) for r in cur.fetchall()]
                res = {'success': True, 'data': rows}

            elif action == 'queryOne':
                cur.execute(sql, params)
                row = cur.fetchone()
                res = {'success': True, 'data': dict(row) if row else None}

            elif action == 'run':
                cur.execute(sql, params)
                conn.commit()
                res = {'success': True, 'lastInsertRowid': cur.lastrowid, 'changes': cur.rowcount}

            elif action == 'previewInvoiceNumber':
                cand = preview_invoice_number()
                res = {'success': True, 'data': cand}

            elif action == 'saveInvoice':
                r_data = save_invoice(req.get('data', {}), req.get('items', []))
                res = {'success': True, 'data': r_data}

            elif action == 'tablesList':
                cur.execute("""
                    SELECT t.*,
                           i.id as active_invoice_id,
                           i.invoice_number as active_invoice_number,
                           i.net_total as active_invoice_total,
                           i.status as active_invoice_status,
                           i.created_at as active_invoice_time,
                           c.name as customer_name
                    FROM tables t
                    LEFT JOIN invoices i ON i.id = (
                      SELECT id FROM invoices 
                      WHERE table_id = t.id AND status IN ('مفتوحة', 'مرسلة للمطبخ') 
                      ORDER BY id DESC LIMIT 1
                    )
                    LEFT JOIN customers c ON c.id = i.customer_id
                    WHERE t.is_active = 1
                    ORDER BY t.section, t.name
                """)
                rows = [dict(r) for r in cur.fetchall()]
                res = {'success': True, 'data': rows}

            elif action == 'tablesReserve':
                tbl_id = req.get('tableId')
                name = req.get('name')
                phone = req.get('phone')
                t_time = req.get('time')
                party_size = req.get('partySize')

                cur.execute("""
                    UPDATE tables 
                    SET status='محجوزة', reservation_name=?, reservation_phone=?, reservation_time=?, reservation_party_size=? 
                    WHERE id=?
                """, (name, phone, t_time, party_size, tbl_id))

                if phone and str(phone).strip():
                    clean_phone = str(phone).strip()
                    clean_name = str(name).strip() if name else 'عميل حجز'
                    cur.execute("SELECT id FROM customers WHERE phone = ?", (clean_phone,))
                    existing = cur.fetchone()
                    if existing:
                        cust_id = existing['id'] if hasattr(existing, 'keys') else existing[0]
                        cur.execute("UPDATE customers SET name = ? WHERE id = ?", (clean_name, cust_id))
                    else:
                        cur.execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (clean_name, clean_phone))

                conn.commit()
                res = {'success': True}

            elif action == 'tablesUpdateStatus':
                tbl_id = req.get('tableId')
                status = req.get('status')
                if status == 'فاضية':
                    cur.execute("""
                        UPDATE tables 
                        SET status=?, reservation_name=NULL, reservation_phone=NULL, reservation_time=NULL, reservation_party_size=NULL 
                        WHERE id=?
                    """, (status, tbl_id))
                else:
                    cur.execute("UPDATE tables SET status=? WHERE id=?", (status, tbl_id))
                conn.commit()
                res = {'success': True}

            elif action == 'tablesSave':
                tbl_data = req.get('data', req)
                t_id = tbl_data.get('id')
                t_name = tbl_data.get('name')
                t_sec = tbl_data.get('section', 'الصالة الرئيسية')
                t_seats = tbl_data.get('seats', 4)
                if t_id:
                    cur.execute("UPDATE tables SET name=?, section=?, seats=? WHERE id=?", (t_name, t_sec, t_seats, t_id))
                else:
                    cur.execute("INSERT INTO tables (name, section, seats, status) VALUES (?, ?, ?, 'فاضية')", (t_name, t_sec, t_seats))
                conn.commit()
                res = {'success': True}

            elif action == 'tablesDelete':
                tbl_id = req.get('id')
                cur.execute("UPDATE tables SET is_active=0 WHERE id=?", (tbl_id,))
                conn.commit()
                res = {'success': True}

            elif action == 'previewInvoiceNumber':
                inv_num = generate_invoice_number()
                res = {'success': True, 'data': inv_num}

            elif action == 'getSettings':
                cur.execute("SELECT * FROM company_settings WHERE id = 1")
                row = cur.fetchone()
                res = {'success': True, 'data': dict(row) if row else None}

            elif action == 'getAllSizes':
                cur.execute("SELECT * FROM service_sizes ORDER BY service_id ASC, id ASC")
                rows = [dict(r) for r in cur.fetchall()]
                res = {'success': True, 'data': rows}

            elif action == 'getSizes':
                svc_id = req.get('service_id')
                cur.execute("SELECT * FROM service_sizes WHERE service_id = ? ORDER BY id ASC", (svc_id,))
                rows = [dict(r) for r in cur.fetchall()]
                res = {'success': True, 'data': rows}

            elif action == 'authLogin':
                res = auth_login(req.get('username'), req.get('password'))

            elif action == 'authSession':
                res = auth_session()

            elif action == 'authLogout':
                res = auth_logout()

            elif action == 'verifyAdminPassword':
                res = verify_admin_password(req.get('password'))

            elif action == 'qrMenuGetData':
                res = qr_menu_get_data()

            elif action == 'qrMenuSubmitOrder':
                res = qr_menu_submit_order(req.get('data', req))

            elif action == 'qrMenuGetOrderStatus':
                res = qr_menu_get_order_status(req.get('order_id'))

            elif action == 'qrOrdersGetPending':
                res = qr_orders_get_pending()

            elif action == 'qrOrdersApprove':
                res = qr_orders_approve(req.get('order_id'))

            elif action == 'qrOrdersReject':
                res = qr_orders_reject(req.get('order_id'), req.get('reason', ''))

            elif action == 'qrOrdersUpdateStatus':
                res = qr_orders_update_status(req.get('order_id'), req.get('status', ''))

            elif action == 'updateSettings':
                res = update_company_settings(req.get('data', {}))

            else:
                res = {'success': False, 'error': f"Unknown action: {action}"}

        except Exception as e:
            res = {'success': False, 'error': str(e)}

        sys.stdout.write(json.dumps(res, ensure_ascii=False) + '\n')
        sys.stdout.flush()

if __name__ == '__main__':
    main()
