import os, sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

db_path = os.path.join(os.environ.get('APPDATA', ''), 'cafepro-system', 'photostudio.db')
print("Connecting to:", db_path)
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Check existing invoices
cur.execute("SELECT id, invoice_number, invoice_date FROM invoices ORDER BY id ASC")
invoices = cur.fetchall()
print("Found invoices:", len(invoices))

# 2. Update existing invoice numbers to 4 digits: 0001, 0002, ...
for idx, (inv_id, old_num, inv_date) in enumerate(invoices, start=1):
    new_num = f"{idx:04d}"
    print(f"Updating invoice {inv_id}: {old_num} -> {new_num}")
    cur.execute("UPDATE invoices SET invoice_number = ? WHERE id = ?", (new_num, inv_id))

# Also update any returns that reference old_num
for idx, (inv_id, old_num, inv_date) in enumerate(invoices, start=1):
    new_num = f"{idx:04d}"
    cur.execute("UPDATE returns SET original_invoice_id = ? WHERE original_invoice_id = ?", (inv_id, inv_id))

# 3. Drop unique index on invoice_number if any, and create monthly index
cur.execute("PRAGMA index_list('invoices')")
indexes = cur.fetchall()
print("Current indexes:", indexes)

# Check if sqlite_autoindex_invoices_1 exists (from CREATE TABLE ... UNIQUE)
# To remove column-level UNIQUE in SQLite, we recreate the table or use a temporary table
cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoices'")
create_sql = cur.fetchone()[0]

if "invoice_number TEXT UNIQUE" in create_sql:
    print("Recreating invoices table without global UNIQUE on invoice_number...")
    cur.execute("PRAGMA foreign_keys = OFF")
    conn.commit()
    
    # Create new table definition without UNIQUE
    new_create_sql = create_sql.replace("invoice_number TEXT UNIQUE", "invoice_number TEXT")
    cur.execute("ALTER TABLE invoices RENAME TO invoices_old")
    cur.execute(new_create_sql)
    
    # Get common columns
    cur.execute("PRAGMA table_info(invoices)")
    cols = [r[1] for r in cur.fetchall()]
    cols_str = ", ".join(cols)
    
    cur.execute(f"INSERT INTO invoices ({cols_str}) SELECT {cols_str} FROM invoices_old")
    cur.execute("DROP TABLE invoices_old")
    
    # Recreate normal index (not unique across years, or composite monthly index)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_invoices_monthly ON invoices(invoice_number, invoice_date)")
    
    cur.execute("PRAGMA foreign_keys = ON")
    conn.commit()
    print("Invoices table successfully migrated!")

# 4. Update invoice_sequence table
now_cur = cur.execute("SELECT * FROM invoice_sequence WHERE id = 1").fetchone()
count_invoices = len(invoices)
cur.execute("UPDATE invoice_sequence SET last_number = ?, year = 2026, month = 9 WHERE id = 1", (count_invoices,))
conn.commit()
print(f"invoice_sequence updated to last_number = {count_invoices}")

conn.close()
print("Migration complete!")
