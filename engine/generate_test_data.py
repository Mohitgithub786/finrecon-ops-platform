"""
generate_test_data.py
---------------------
Generates realistic synthetic bank statement and company ledger CSV files
for testing the Finance Transaction Reconciliation Engine.

Intentionally injects controlled error scenarios so the reconciliation
engine has real discrepancies to detect and classify. All data is 100%
synthetic — no real financial data is used.

Error scenarios injected:
  - Amount mismatches (bank vs ledger differ)
  - Date mismatches (bank date differs from ledger date by N days)
  - Missing bank transactions (ledger has entry, bank does not)
  - Missing ledger transactions (bank has entry, ledger does not)
  - Duplicate transactions (same invoice recorded twice)
  - Large transactions (above approval threshold)
  - Missing reference numbers (blank invoice ID)
"""

import pandas as pd
import numpy as np
import random
import uuid
from datetime import datetime, timedelta
from faker import Faker

fake = Faker()
Faker.seed(42)
random.seed(42)
np.random.seed(42)

# ─── Configuration ────────────────────────────────────────────────────────────

PERIOD_START = datetime(2024, 7, 1)
PERIOD_END   = datetime(2024, 7, 31)

TOTAL_CLEAN_TRANSACTIONS = 1800   # transactions that match cleanly

# Error injection rates (as fraction of clean count)
ERROR_RATES = {
    "amount_mismatch":    0.07,   # 7%  → ~126 transactions
    "date_mismatch":      0.04,   # 4%  → ~72  transactions
    "missing_bank":       0.05,   # 5%  → ~90  transactions (ledger only)
    "missing_ledger":     0.04,   # 4%  → ~72  transactions (bank only)
    "duplicate_bank":     0.02,   # 2%  → ~36  transactions
    "large_transaction":  0.02,   # 2%  → ~36  transactions (above $10k)
    "missing_reference":  0.02,   # 2%  → ~36  transactions
}

DEPARTMENTS = ["Operations", "Marketing", "Engineering", "Finance", "HR", "Legal", "Sales", "Procurement"]
VENDORS     = [
    "Acme Corp", "GlobalTech Ltd", "Vertex Solutions", "NovaBuild Inc",
    "PrimeSoft", "DataBridge Co", "AlphaConsult", "BetaServices",
    "CloudMatrix", "IronForge Systems", "BlueSky Analytics", "CoreLogic",
    "Pinnacle Group", "Triton Partners", "Nexus Dynamics", "ZeroBase Inc",
    "Meridian Tech", "Apex Ventures", "Sigma Holdings", "Cascade Group",
]
CATEGORIES = ["Software", "Hardware", "Consulting", "Office Supplies", "Travel",
              "Marketing", "Legal", "Utilities", "Maintenance", "Training"]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def random_date(start: datetime, end: datetime) -> datetime:
    delta = end - start
    return start + timedelta(days=random.randint(0, delta.days),
                              hours=random.randint(9, 17),
                              minutes=random.randint(0, 59))

def generate_invoice_id() -> str:
    return f"INV-2024-{random.randint(10000, 99999)}"

def generate_amount(large: bool = False) -> float:
    if large:
        return round(random.uniform(10_001, 75_000), 2)
    return round(random.uniform(50, 9_999), 2)

def generate_reference_id() -> str:
    return f"REF-{uuid.uuid4().hex[:8].upper()}"

def build_transaction_base(invoice_id: str, vendor: str, amount: float,
                            tx_date: datetime, department: str,
                            category: str, reference: str) -> dict:
    """Returns the shared fields used in both bank and ledger records."""
    return {
        "invoice_id":   invoice_id,
        "vendor":       vendor,
        "amount":       amount,
        "date":         tx_date.strftime("%Y-%m-%d"),
        "department":   department,
        "category":     category,
        "reference_id": reference,
        "description":  f"{category} services - {vendor}",
    }

# ─── Core Generation ──────────────────────────────────────────────────────────

def generate_clean_transactions(n: int) -> list[dict]:
    """
    Generate N clean (perfectly matching) transactions.
    Each returns a dict with both bank and ledger sides identical.
    """
    rows = []
    for _ in range(n):
        tx_date   = random_date(PERIOD_START, PERIOD_END)
        invoice   = generate_invoice_id()
        vendor    = random.choice(VENDORS)
        amount    = generate_amount()
        dept      = random.choice(DEPARTMENTS)
        cat       = random.choice(CATEGORIES)
        ref       = generate_reference_id()
        base      = build_transaction_base(invoice, vendor, amount, tx_date, dept, cat, ref)
        rows.append({"type": "clean", "bank": base.copy(), "ledger": base.copy()})
    return rows


def generate_amount_mismatches(n: int) -> list[dict]:
    """Amount differs between bank statement and ledger."""
    rows = []
    for _ in range(n):
        tx_date    = random_date(PERIOD_START, PERIOD_END)
        invoice    = generate_invoice_id()
        vendor     = random.choice(VENDORS)
        bank_amt   = generate_amount()
        # Ledger amount differs by ±2% to ±15%
        delta      = round(random.uniform(0.02, 0.15) * bank_amt * random.choice([-1, 1]), 2)
        ledger_amt = round(bank_amt + delta, 2)
        dept       = random.choice(DEPARTMENTS)
        cat        = random.choice(CATEGORIES)
        ref        = generate_reference_id()
        bank_side  = build_transaction_base(invoice, vendor, bank_amt,  tx_date, dept, cat, ref)
        ledger_side = build_transaction_base(invoice, vendor, ledger_amt, tx_date, dept, cat, ref)
        rows.append({"type": "amount_mismatch", "bank": bank_side, "ledger": ledger_side})
    return rows


def generate_date_mismatches(n: int) -> list[dict]:
    """Same transaction, different posting dates."""
    rows = []
    for _ in range(n):
        bank_date   = random_date(PERIOD_START, PERIOD_END)
        offset_days = random.choice([-5, -4, -3, 3, 4, 5, 6, 7])
        ledger_date = bank_date + timedelta(days=offset_days)
        invoice     = generate_invoice_id()
        vendor      = random.choice(VENDORS)
        amount      = generate_amount()
        dept        = random.choice(DEPARTMENTS)
        cat         = random.choice(CATEGORIES)
        ref         = generate_reference_id()
        bank_side   = build_transaction_base(invoice, vendor, amount, bank_date,   dept, cat, ref)
        ledger_side = build_transaction_base(invoice, vendor, amount, ledger_date, dept, cat, ref)
        rows.append({"type": "date_mismatch", "bank": bank_side, "ledger": ledger_side})
    return rows


def generate_missing_bank(n: int) -> list[dict]:
    """Transaction in ledger but NOT in bank statement."""
    rows = []
    for _ in range(n):
        tx_date = random_date(PERIOD_START, PERIOD_END)
        invoice = generate_invoice_id()
        vendor  = random.choice(VENDORS)
        amount  = generate_amount()
        dept    = random.choice(DEPARTMENTS)
        cat     = random.choice(CATEGORIES)
        ref     = generate_reference_id()
        ledger_side = build_transaction_base(invoice, vendor, amount, tx_date, dept, cat, ref)
        rows.append({"type": "missing_bank", "bank": None, "ledger": ledger_side})
    return rows


def generate_missing_ledger(n: int) -> list[dict]:
    """Transaction in bank statement but NOT in internal ledger."""
    rows = []
    for _ in range(n):
        tx_date    = random_date(PERIOD_START, PERIOD_END)
        invoice    = generate_invoice_id()
        vendor     = random.choice(VENDORS)
        amount     = generate_amount()
        dept       = random.choice(DEPARTMENTS)
        cat        = random.choice(CATEGORIES)
        ref        = generate_reference_id()
        bank_side  = build_transaction_base(invoice, vendor, amount, tx_date, dept, cat, ref)
        rows.append({"type": "missing_ledger", "bank": bank_side, "ledger": None})
    return rows


def generate_duplicates(n: int) -> list[dict]:
    """
    Same invoice recorded twice in the bank.
    Both duplicates have identical details — a clerical double-entry.
    """
    rows = []
    for _ in range(n):
        tx_date   = random_date(PERIOD_START, PERIOD_END)
        invoice   = generate_invoice_id()
        vendor    = random.choice(VENDORS)
        amount    = generate_amount()
        dept      = random.choice(DEPARTMENTS)
        cat       = random.choice(CATEGORIES)
        ref       = generate_reference_id()
        base      = build_transaction_base(invoice, vendor, amount, tx_date, dept, cat, ref)
        # duplicate: bank has two identical entries, ledger has one
        rows.append({"type": "duplicate", "bank": base.copy(), "ledger": base.copy()})
        rows.append({"type": "duplicate_copy", "bank": base.copy(), "ledger": None})
    return rows


def generate_large_transactions(n: int) -> list[dict]:
    """Above-threshold transactions requiring manual approval."""
    rows = []
    for _ in range(n):
        tx_date   = random_date(PERIOD_START, PERIOD_END)
        invoice   = generate_invoice_id()
        vendor    = random.choice(VENDORS)
        amount    = generate_amount(large=True)
        dept      = random.choice(DEPARTMENTS)
        cat       = random.choice(CATEGORIES)
        ref       = generate_reference_id()
        base      = build_transaction_base(invoice, vendor, amount, tx_date, dept, cat, ref)
        rows.append({"type": "large_transaction", "bank": base.copy(), "ledger": base.copy()})
    return rows


def generate_missing_references(n: int) -> list[dict]:
    """Transactions with blank/missing reference/invoice numbers."""
    rows = []
    for _ in range(n):
        tx_date   = random_date(PERIOD_START, PERIOD_END)
        invoice   = ""   # intentionally blank
        vendor    = random.choice(VENDORS)
        amount    = generate_amount()
        dept      = random.choice(DEPARTMENTS)
        cat       = random.choice(CATEGORIES)
        ref       = ""   # no reference
        bank_side = build_transaction_base(invoice, vendor, amount, tx_date, dept, cat, ref)
        rows.append({"type": "missing_reference", "bank": bank_side, "ledger": None})
    return rows

# ─── Assemble & Export ────────────────────────────────────────────────────────

def assemble_csvs(all_transactions: list[dict]):
    bank_rows   = []
    ledger_rows = []

    bank_id_counter   = 1
    ledger_id_counter = 1

    for tx in all_transactions:
        # ── Bank side ─────────────────────────────────────────────────────
        if tx["bank"] is not None:
            b = tx["bank"].copy()
            b["bank_txn_id"] = f"BNK-{bank_id_counter:05d}"
            b["source"]      = "bank"
            bank_id_counter += 1
            bank_rows.append(b)

        # ── Ledger side ───────────────────────────────────────────────────
        if tx["ledger"] is not None:
            l = tx["ledger"].copy()
            l["ledger_txn_id"] = f"LDG-{ledger_id_counter:05d}"
            l["source"]        = "ledger"
            ledger_id_counter += 1
            ledger_rows.append(l)

    # Shuffle rows so errors are distributed throughout the file
    random.shuffle(bank_rows)
    random.shuffle(ledger_rows)

    bank_df   = pd.DataFrame(bank_rows)
    ledger_df = pd.DataFrame(ledger_rows)

    # Ensure consistent column order
    bank_cols = ["bank_txn_id", "invoice_id", "reference_id", "vendor", "amount",
                 "date", "department", "category", "description", "source"]
    ledger_cols = ["ledger_txn_id", "invoice_id", "reference_id", "vendor", "amount",
                   "date", "department", "category", "description", "source"]

    bank_df   = bank_df[bank_cols]
    ledger_df = ledger_df[ledger_cols]

    return bank_df, ledger_df


def generate(output_dir: str = "../data/test"):
    """Main generation entry point."""
    import os
    os.makedirs(output_dir, exist_ok=True)

    n_clean          = TOTAL_CLEAN_TRANSACTIONS
    n_amt_mismatch   = int(n_clean * ERROR_RATES["amount_mismatch"])
    n_date_mismatch  = int(n_clean * ERROR_RATES["date_mismatch"])
    n_miss_bank      = int(n_clean * ERROR_RATES["missing_bank"])
    n_miss_ledger    = int(n_clean * ERROR_RATES["missing_ledger"])
    n_duplicates     = int(n_clean * ERROR_RATES["duplicate_bank"])
    n_large          = int(n_clean * ERROR_RATES["large_transaction"])
    n_missing_ref    = int(n_clean * ERROR_RATES["missing_reference"])

    print("Generating test dataset...")
    print(f"  Clean transactions      : {n_clean}")
    print(f"  Amount mismatches       : {n_amt_mismatch}")
    print(f"  Date mismatches         : {n_date_mismatch}")
    print(f"  Missing bank entries    : {n_miss_bank}")
    print(f"  Missing ledger entries  : {n_miss_ledger}")
    print(f"  Duplicate transactions  : {n_duplicates}")
    print(f"  Large transactions      : {n_large}")
    print(f"  Missing references      : {n_missing_ref}")

    all_tx = []
    all_tx += generate_clean_transactions(n_clean)
    all_tx += generate_amount_mismatches(n_amt_mismatch)
    all_tx += generate_date_mismatches(n_date_mismatch)
    all_tx += generate_missing_bank(n_miss_bank)
    all_tx += generate_missing_ledger(n_miss_ledger)
    all_tx += generate_duplicates(n_duplicates)
    all_tx += generate_large_transactions(n_large)
    all_tx += generate_missing_references(n_missing_ref)

    random.shuffle(all_tx)

    bank_df, ledger_df = assemble_csvs(all_tx)

    bank_path   = os.path.join(output_dir, "bank_statement.csv")
    ledger_path = os.path.join(output_dir, "ledger.csv")

    bank_df.to_csv(bank_path,   index=False)
    ledger_df.to_csv(ledger_path, index=False)

    total_bank   = len(bank_df)
    total_ledger = len(ledger_df)

    print(f"\nDataset written:")
    print(f"  Bank statement : {bank_path}  ({total_bank} rows)")
    print(f"  Ledger         : {ledger_path} ({total_ledger} rows)")
    print(f"  Total combined : {total_bank + total_ledger} rows")

    # Write a manifest so other scripts know what to expect
    manifest = {
        "generated_at":       datetime.now().isoformat(),
        "period":             f"{PERIOD_START.date()} to {PERIOD_END.date()}",
        "bank_rows":          total_bank,
        "ledger_rows":        total_ledger,
        "clean_transactions": n_clean,
        "injected_errors": {
            "amount_mismatch":   n_amt_mismatch,
            "date_mismatch":     n_date_mismatch,
            "missing_bank":      n_miss_bank,
            "missing_ledger":    n_miss_ledger,
            "duplicates":        n_duplicates,
            "large_transaction": n_large,
            "missing_reference": n_missing_ref,
        }
    }

    import json
    with open(os.path.join(output_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print("\nManifest written to manifest.json")
    return bank_df, ledger_df


if __name__ == "__main__":
    generate()
