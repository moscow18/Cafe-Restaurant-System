import os, sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')
db_path = os.path.join(os.environ.get('APPDATA', ''), 'cafepro-system', 'photostudio.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT id, invoice_number, invoice_date, net_total FROM invoices ORDER BY id DESC LIMIT 15")
rows = cur.fetchall()
print("Total invoices count:", cur.execute("SELECT COUNT(*) FROM invoices").fetchone()[0])
for r in rows:
    print(dict(r) if hasattr(r, 'keys') else r)
conn.close()
