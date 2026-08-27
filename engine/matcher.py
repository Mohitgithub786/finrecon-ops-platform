"""
matcher.py
----------
Multi-pass reconciliation matching algorithm.

Reconciliation strategy:
  Pass 1 — Exact Match      : invoice_id + amount within tolerance + date within window → MATCHED
  Pass 2 — Amount Mismatch  : invoice_id matches but amount difference exceeds tolerance → AMOUNT_MISMATCH
  Pass 3 — Date Mismatch    : invoice_id matches but date offset > DATE_TOLERANCE_DAYS → DATE_MISMATCH
  Pass 4 — Missing Bank     : in ledger only → MISSING_BANK
  Pass 5 — Missing Ledger   : in bank only   → MISSING_LEDGER
  Pass 6 — Duplicate        : same invoice_id appears more than once in a single source → DUPLICATE

Each output row includes:
  - All transaction fields from bank and/or ledger
  - reconciliation_status  (one of the 6 types above + MATCHED)
  - exception_reason       (human-readable explanation string)
  - amount_discrepancy     (bank_amount - ledger_amount, for mismatches)
  - date_discrepancy_days  (bank_date - ledger_date, for date mismatches)
"""

import pandas as pd
import numpy as np
from datetime import timedelta
from typing import Tuple

# ─── Thresholds ───────────────────────────────────────────────────────────────

AMOUNT_TOLERANCE   = 0.01   # Dollar tolerance for "matched" (handles penny rounding)
DATE_TOLERANCE_DAYS = 2     # Days tolerance for "matched" (handles settlement delays)

# ─── Status constants ─────────────────────────────────────────────────────────

STATUS_MATCHED           = "MATCHED"
STATUS_AMOUNT_MISMATCH   = "AMOUNT_MISMATCH"
STATUS_DATE_MISMATCH     = "DATE_MISMATCH"
STATUS_MISSING_BANK      = "MISSING_BANK"
STATUS_MISSING_LEDGER    = "MISSING_LEDGER"
STATUS_DUPLICATE         = "DUPLICATE"


# ─── Reason generators ────────────────────────────────────────────────────────

def _reason_matched() -> str:
    return "Transaction matched: invoice, amount, and date all reconcile within tolerance."

def _reason_amount_mismatch(bank_amt: float, ledger_amt: float) -> str:
    diff = round(abs(bank_amt - ledger_amt), 2)
    direction = "higher" if bank_amt > ledger_amt else "lower"
    return (
        f"Amount mismatch: Bank recorded ${bank_amt:,.2f}, Ledger shows ${ledger_amt:,.2f}. "
        f"Difference of ${diff:,.2f} exceeds tolerance of ${AMOUNT_TOLERANCE:,.2f}. "
        f"Bank amount is {direction} than Ledger."
    )

def _reason_date_mismatch(invoice: str, bank_date, ledger_date, days: int) -> str:
    direction = "earlier" if days < 0 else "later"
    return (
        f"Date mismatch: Invoice {invoice} posted {abs(days)} day(s) {direction} in Bank "
        f"({bank_date}) vs Ledger ({ledger_date}). "
        f"Exceeds tolerance of {DATE_TOLERANCE_DAYS} day(s)."
    )

def _reason_missing_bank(invoice: str, vendor: str, amount: float) -> str:
    return (
        f"Missing bank entry: Invoice {invoice} from {vendor} (${amount:,.2f}) "
        f"exists in the internal Ledger but has no corresponding Bank transaction. "
        f"Possible cause: bank delay, payment not yet cleared, or data entry omission."
    )

def _reason_missing_ledger(invoice: str, vendor: str, amount: float) -> str:
    return (
        f"Missing ledger entry: Bank recorded a transaction for Invoice {invoice} "
        f"from {vendor} (${amount:,.2f}) that has no matching internal Ledger entry. "
        f"Possible cause: unrecorded payment, bank error, or unauthorized transaction."
    )

def _reason_duplicate(invoice: str, source: str, count: int) -> str:
    return (
        f"Duplicate transaction: Invoice {invoice} appears {count} time(s) in the {source}. "
        f"Only one instance should exist. Possible cause: double data entry or system error."
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _prep_for_merge(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    """
    Rename columns with a prefix so bank and ledger columns don't collide
    after the outer join, while keeping invoice_id as the join key.
    """
    rename_map = {}
    for col in df.columns:
        if col != "invoice_id":
            rename_map[col] = f"{prefix}_{col}"
    return df.rename(columns=rename_map)


def _detect_duplicates_in_source(df: pd.DataFrame, source_name: str) -> pd.DataFrame:
    """
    Finds invoice_ids that appear more than once in a single source.
    Returns a DataFrame of duplicate records with reconciliation columns set.
    """
    dup_mask = df.duplicated(subset=["invoice_id"], keep=False)
    dup_df   = df[dup_mask].copy()

    if dup_df.empty:
        return pd.DataFrame()

    dup_counts = df[dup_mask].groupby("invoice_id").size().to_dict()

    records = []
    for _, row in dup_df.iterrows():
        inv = row.get("invoice_id", "")
        cnt = dup_counts.get(inv, 2)
        rec = row.to_dict()
        rec["reconciliation_status"] = STATUS_DUPLICATE
        rec["exception_reason"]      = _reason_duplicate(inv, source_name, cnt)
        rec["amount_discrepancy"]    = 0.0
        rec["date_discrepancy_days"] = 0
        records.append(rec)

    return pd.DataFrame(records)


# ─── Core Matching ────────────────────────────────────────────────────────────

def reconcile(bank_df: pd.DataFrame, ledger_df: pd.DataFrame) -> pd.DataFrame:
    """
    Run the multi-pass reconciliation algorithm.

    Parameters
    ----------
    bank_df   : Normalized bank statement DataFrame from loader.py
    ledger_df : Normalized company ledger DataFrame from loader.py

    Returns
    -------
    results_df : DataFrame with one row per transaction pair (or singleton),
                 including reconciliation_status and exception_reason columns.
    """
    print("\n[MATCHER] Starting multi-pass reconciliation...")

    # ── Pass 6 (pre-check): Duplicate detection within each source ────────────
    print("  Pass 6 — Detecting duplicates within each source...")
    bank_dups   = _detect_duplicates_in_source(bank_df,   "Bank")
    ledger_dups = _detect_duplicates_in_source(ledger_df, "Ledger")

    # Remove duplicates from main flow (they get their own output rows)
    bank_dup_invoices   = set(bank_dups["invoice_id"])   if not bank_dups.empty   else set()
    ledger_dup_invoices = set(ledger_dups["invoice_id"]) if not ledger_dups.empty else set()

    bank_clean   = bank_df[~bank_df["invoice_id"].isin(bank_dup_invoices)].copy()
    ledger_clean = ledger_df[~ledger_df["invoice_id"].isin(ledger_dup_invoices)].copy()

    n_bank_dups   = len(bank_dups)
    n_ledger_dups = len(ledger_dups)
    print(f"    Found {n_bank_dups} duplicate bank rows, {n_ledger_dups} duplicate ledger rows.")

    # ── Outer join on invoice_id ───────────────────────────────────────────────
    print("  Pass 1-5 — Outer join on invoice_id...")
    bank_prep   = _prep_for_merge(bank_clean,   "bank")
    ledger_prep = _prep_for_merge(ledger_clean, "ledger")

    merged = pd.merge(
        bank_prep,
        ledger_prep,
        on="invoice_id",
        how="outer",
        indicator=True,  # adds _merge column: 'both', 'left_only', 'right_only'
    )

    results = []

    # ── Passes 1–3: Rows present in BOTH ──────────────────────────────────────
    both_mask = merged["_merge"] == "both"
    both_df   = merged[both_mask].copy()

    n_both = len(both_df)
    print(f"    Invoice-matched rows: {n_both}")

    matched_count        = 0
    amount_mismatch_count = 0
    date_mismatch_count   = 0

    for _, row in both_df.iterrows():
        bank_amt    = row.get("bank_amount",   np.nan)
        ledger_amt  = row.get("ledger_amount", np.nan)
        bank_date   = row.get("bank_date",     pd.NaT)
        ledger_date = row.get("ledger_date",   pd.NaT)
        invoice     = row.get("invoice_id",    "")
        vendor      = row.get("bank_vendor",   row.get("ledger_vendor", "Unknown"))

        amt_diff  = round(abs(bank_amt - ledger_amt), 2) if pd.notna(bank_amt) and pd.notna(ledger_amt) else None
        date_diff = None
        if pd.notna(bank_date) and pd.notna(ledger_date):
            date_diff = int((bank_date - ledger_date).days)

        # Build output record
        rec = {
            "invoice_id":           invoice,
            "bank_txn_id":          row.get("bank_bank_txn_id", ""),
            "ledger_txn_id":        row.get("ledger_ledger_txn_id", ""),
            "vendor":               vendor,
            "bank_amount":          bank_amt,
            "ledger_amount":        ledger_amt,
            "bank_date":            str(bank_date.date()) if pd.notna(bank_date) else "",
            "ledger_date":          str(ledger_date.date()) if pd.notna(ledger_date) else "",
            "reference_id":         row.get("bank_reference_id", row.get("ledger_reference_id", "")),
            "department":           row.get("bank_department",   row.get("ledger_department",   "")),
            "category":             row.get("bank_category",     row.get("ledger_category",     "")),
            "description":          row.get("bank_description",  row.get("ledger_description",  "")),
            "amount_discrepancy":   0.0,
            "date_discrepancy_days": 0,
        }

        # ── Pass 2: Amount mismatch ──────────────────────────────────────────
        if amt_diff is not None and amt_diff > AMOUNT_TOLERANCE:
            rec["reconciliation_status"] = STATUS_AMOUNT_MISMATCH
            rec["exception_reason"]      = _reason_amount_mismatch(bank_amt, ledger_amt)
            rec["amount_discrepancy"]    = round(bank_amt - ledger_amt, 2)
            amount_mismatch_count += 1

        # ── Pass 3: Date mismatch ────────────────────────────────────────────
        elif date_diff is not None and abs(date_diff) > DATE_TOLERANCE_DAYS:
            rec["reconciliation_status"] = STATUS_DATE_MISMATCH
            rec["exception_reason"]      = _reason_date_mismatch(invoice, bank_date, ledger_date, date_diff)
            rec["date_discrepancy_days"] = date_diff
            date_mismatch_count += 1

        # ── Pass 1: Clean match ──────────────────────────────────────────────
        else:
            rec["reconciliation_status"] = STATUS_MATCHED
            rec["exception_reason"]      = _reason_matched()
            matched_count += 1

        results.append(rec)

    # ── Pass 5: Missing ledger (bank only) ────────────────────────────────────
    bank_only_df = merged[merged["_merge"] == "left_only"].copy()
    missing_ledger_count = len(bank_only_df)
    print(f"    Bank-only rows (missing ledger): {missing_ledger_count}")

    for _, row in bank_only_df.iterrows():
        bank_amt = row.get("bank_amount", np.nan)
        invoice  = row.get("invoice_id", "")
        vendor   = row.get("bank_vendor", "Unknown")
        bank_date = row.get("bank_date", pd.NaT)

        rec = {
            "invoice_id":           invoice,
            "bank_txn_id":          row.get("bank_bank_txn_id", ""),
            "ledger_txn_id":        "",
            "vendor":               vendor,
            "bank_amount":          bank_amt,
            "ledger_amount":        None,
            "bank_date":            str(bank_date.date()) if pd.notna(bank_date) else "",
            "ledger_date":          "",
            "reference_id":         row.get("bank_reference_id", ""),
            "department":           row.get("bank_department",   ""),
            "category":             row.get("bank_category",     ""),
            "description":          row.get("bank_description",  ""),
            "reconciliation_status": STATUS_MISSING_LEDGER,
            "exception_reason":     _reason_missing_ledger(invoice, vendor, bank_amt if pd.notna(bank_amt) else 0),
            "amount_discrepancy":   round(float(bank_amt), 2) if pd.notna(bank_amt) else 0.0,
            "date_discrepancy_days": 0,
        }
        results.append(rec)

    # ── Pass 4: Missing bank (ledger only) ────────────────────────────────────
    ledger_only_df = merged[merged["_merge"] == "right_only"].copy()
    missing_bank_count = len(ledger_only_df)
    print(f"    Ledger-only rows (missing bank): {missing_bank_count}")

    for _, row in ledger_only_df.iterrows():
        ledger_amt  = row.get("ledger_amount", np.nan)
        invoice     = row.get("invoice_id", "")
        vendor      = row.get("ledger_vendor", "Unknown")
        ledger_date = row.get("ledger_date", pd.NaT)

        rec = {
            "invoice_id":           invoice,
            "bank_txn_id":          "",
            "ledger_txn_id":        row.get("ledger_ledger_txn_id", ""),
            "vendor":               vendor,
            "bank_amount":          None,
            "ledger_amount":        ledger_amt,
            "bank_date":            "",
            "ledger_date":          str(ledger_date.date()) if pd.notna(ledger_date) else "",
            "reference_id":         row.get("ledger_reference_id", ""),
            "department":           row.get("ledger_department",   ""),
            "category":             row.get("ledger_category",     ""),
            "description":          row.get("ledger_description",  ""),
            "reconciliation_status": STATUS_MISSING_BANK,
            "exception_reason":     _reason_missing_bank(invoice, vendor, ledger_amt if pd.notna(ledger_amt) else 0),
            "amount_discrepancy":   round(-float(ledger_amt), 2) if pd.notna(ledger_amt) else 0.0,
            "date_discrepancy_days": 0,
        }
        results.append(rec)

    # ── Merge duplicate records into results ──────────────────────────────────
    all_records_df = pd.DataFrame(results)

    def _flatten_dup(row, prefix):
        """Convert a source-prefixed duplicate row to the output schema."""
        inv = row.get("invoice_id", "")
        amt = row.get(f"{prefix}_amount",  row.get("amount", np.nan))
        dt  = row.get(f"{prefix}_date",    row.get("date", pd.NaT))
        vnd = row.get(f"{prefix}_vendor",  row.get("vendor", "Unknown"))
        return {
            "invoice_id":           inv,
            "bank_txn_id":          row.get("bank_txn_id",   ""),
            "ledger_txn_id":        row.get("ledger_txn_id", ""),
            "vendor":               vnd,
            "bank_amount":          amt if prefix == "bank"   else None,
            "ledger_amount":        amt if prefix == "ledger" else None,
            "bank_date":            str(dt.date()) if pd.notna(dt) and prefix == "bank"   else "",
            "ledger_date":          str(dt.date()) if pd.notna(dt) and prefix == "ledger" else "",
            "reference_id":         row.get("reference_id", ""),
            "department":           row.get("department",   ""),
            "category":             row.get("category",     ""),
            "description":          row.get("description",  ""),
            "reconciliation_status": row.get("reconciliation_status", STATUS_DUPLICATE),
            "exception_reason":      row.get("exception_reason",      ""),
            "amount_discrepancy":    row.get("amount_discrepancy",    0.0),
            "date_discrepancy_days": row.get("date_discrepancy_days", 0),
        }

    dup_records = []
    for _, row in bank_dups.iterrows():
        dup_records.append(_flatten_dup(row, "bank"))
    for _, row in ledger_dups.iterrows():
        dup_records.append(_flatten_dup(row, "ledger"))

    if dup_records:
        dup_df = pd.DataFrame(dup_records)
        all_records_df = pd.concat([all_records_df, dup_df], ignore_index=True)

    # ── Summary print ─────────────────────────────────────────────────────────
    print(f"\n[MATCHER] Results:")
    print(f"  MATCHED           : {matched_count}")
    print(f"  AMOUNT_MISMATCH   : {amount_mismatch_count}")
    print(f"  DATE_MISMATCH     : {date_mismatch_count}")
    print(f"  MISSING_LEDGER    : {missing_ledger_count}")
    print(f"  MISSING_BANK      : {missing_bank_count}")
    print(f"  DUPLICATE         : {n_bank_dups + n_ledger_dups}")
    print(f"  Total output rows : {len(all_records_df)}")

    return all_records_df.reset_index(drop=True)


def get_status_counts(results_df: pd.DataFrame) -> dict:
    """Return a count of each reconciliation_status."""
    counts = results_df["reconciliation_status"].value_counts().to_dict()
    for status in [STATUS_MATCHED, STATUS_AMOUNT_MISMATCH, STATUS_DATE_MISMATCH,
                   STATUS_MISSING_BANK, STATUS_MISSING_LEDGER, STATUS_DUPLICATE]:
        counts.setdefault(status, 0)
    return counts
