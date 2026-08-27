"""
controls.py
-----------
Financial Control Rules Engine.

Runs independent checks on reconciled results and raw transaction data
to enforce financial integrity policies. Each rule adds a flag and
generates a human-readable control_alert string.

Rules implemented:
  1. LARGE_TRANSACTION      — Amount exceeds approval threshold ($10,000)
  2. DUPLICATE_INVOICE      — Same invoice_id appears more than once in dataset
  3. MISSING_REFERENCE      — invoice_id or reference_id is blank/empty
  4. APPROVAL_REQUIRED      — Transaction above a secondary threshold ($25,000) requires manager sign-off
  5. NEGATIVE_AMOUNT        — Transaction amount is negative (possible refund/reversal anomaly)
  6. ROUND_AMOUNT_ANOMALY   — Suspiciously round amount (e.g. exactly $5,000.00) that may indicate estimate

Each rule produces:
  - A boolean flag column  (e.g., is_large_transaction)
  - A control_alert string (human-readable explanation)
"""

import pandas as pd
import numpy as np
from typing import List

# ─── Thresholds ───────────────────────────────────────────────────────────────

LARGE_TRANSACTION_THRESHOLD  = 10_000.00   # Requires attention
APPROVAL_REQUIRED_THRESHOLD  = 25_000.00   # Requires explicit manager approval
ROUND_AMOUNT_THRESHOLD       = 1_000.00    # Minimum amount to check for round-number anomaly

# ─── Rule implementations ─────────────────────────────────────────────────────

def _rule_large_transaction(df: pd.DataFrame) -> pd.DataFrame:
    """Flag transactions above $10,000."""
    amounts = df.apply(
        lambda r: max(
            r["bank_amount"]   if pd.notna(r.get("bank_amount"))   else 0,
            r["ledger_amount"] if pd.notna(r.get("ledger_amount")) else 0
        ), axis=1
    )
    df["is_large_transaction"] = amounts > LARGE_TRANSACTION_THRESHOLD
    df["control_alert_large"]  = df.apply(
        lambda r: (
            f"LARGE TRANSACTION: Amount ${amounts[r.name]:,.2f} exceeds the "
            f"${LARGE_TRANSACTION_THRESHOLD:,.0f} threshold. Requires finance review."
        ) if r["is_large_transaction"] else "", axis=1
    )
    return df


def _rule_duplicate_invoice(df: pd.DataFrame) -> pd.DataFrame:
    """Flag invoice_ids that appear more than once in the full results set."""
    invoice_counts = df["invoice_id"].value_counts()
    df["is_duplicate_invoice"] = df["invoice_id"].map(
        lambda inv: invoice_counts.get(inv, 1) > 1 if inv else False
    )
    df["control_alert_duplicate"] = df.apply(
        lambda r: (
            f"DUPLICATE INVOICE: Invoice {r['invoice_id']} appears "
            f"{invoice_counts.get(r['invoice_id'], 1)} time(s) total across Bank & Ledger datasets. "
            f"Verify this is not a double-entry."
        ) if r["is_duplicate_invoice"] and r["invoice_id"] else "", axis=1
    )
    return df


def _rule_missing_reference(df: pd.DataFrame) -> pd.DataFrame:
    """Flag transactions with blank invoice_id or reference_id."""
    def _is_blank(val) -> bool:
        return pd.isna(val) or str(val).strip() == ""

    df["is_missing_reference"] = df.apply(
        lambda r: _is_blank(r.get("invoice_id")) or _is_blank(r.get("reference_id")), axis=1
    )
    df["control_alert_reference"] = df.apply(
        lambda r: (
            "MISSING REFERENCE: Transaction has no invoice ID or reference number. "
            "Cannot be traced to a purchase order. Requires manual identification."
        ) if r["is_missing_reference"] else "", axis=1
    )
    return df


def _rule_approval_required(df: pd.DataFrame) -> pd.DataFrame:
    """Flag transactions above the approval threshold ($25,000)."""
    amounts = df.apply(
        lambda r: max(
            r["bank_amount"]   if pd.notna(r.get("bank_amount"))   else 0,
            r["ledger_amount"] if pd.notna(r.get("ledger_amount")) else 0
        ), axis=1
    )
    df["is_approval_required"] = amounts > APPROVAL_REQUIRED_THRESHOLD
    df["control_alert_approval"] = df.apply(
        lambda r: (
            f"APPROVAL REQUIRED: Amount ${amounts[r.name]:,.2f} exceeds "
            f"${APPROVAL_REQUIRED_THRESHOLD:,.0f} approval threshold. "
            f"Manager sign-off required before processing."
        ) if r["is_approval_required"] else "", axis=1
    )
    return df


def _rule_negative_amount(df: pd.DataFrame) -> pd.DataFrame:
    """Flag any negative amounts (possible erroneous reversals)."""
    df["is_negative_amount"] = df.apply(
        lambda r: (
            (pd.notna(r.get("bank_amount"))   and float(r.get("bank_amount", 0))   < 0) or
            (pd.notna(r.get("ledger_amount")) and float(r.get("ledger_amount", 0)) < 0)
        ), axis=1
    )
    df["control_alert_negative"] = df.apply(
        lambda r: (
            "NEGATIVE AMOUNT: Transaction contains a negative amount. "
            "Verify whether this is an intended refund or a data entry error."
        ) if r["is_negative_amount"] else "", axis=1
    )
    return df


def _rule_round_amount_anomaly(df: pd.DataFrame) -> pd.DataFrame:
    """
    Flag suspiciously round amounts above the threshold.
    e.g., exactly $5,000.00 or $10,000.00 could be placeholder estimates.
    """
    def _is_round(val) -> bool:
        if pd.isna(val):
            return False
        f = float(val)
        return f >= ROUND_AMOUNT_THRESHOLD and f == round(f / 1000) * 1000 and f % 1000 == 0

    df["is_round_amount_anomaly"] = df.apply(
        lambda r: _is_round(r.get("bank_amount")) or _is_round(r.get("ledger_amount")), axis=1
    )
    df["control_alert_round"] = df.apply(
        lambda r: (
            "ROUND AMOUNT ANOMALY: Transaction amount is suspiciously round "
            "(e.g. exactly $1,000 or $5,000). May indicate an estimate rather than "
            "an actual invoice amount. Verify against source document."
        ) if r["is_round_amount_anomaly"] else "", axis=1
    )
    return df


# ─── Aggregation ─────────────────────────────────────────────────────────────

def _build_control_alerts_summary(row) -> str:
    """Combine all non-empty control alert messages into one field."""
    alerts = []
    for col in ["control_alert_large", "control_alert_duplicate",
                "control_alert_reference", "control_alert_approval",
                "control_alert_negative", "control_alert_round"]:
        val = row.get(col, "")
        if val:
            alerts.append(val)
    return " | ".join(alerts) if alerts else ""


def _build_control_flags_list(row) -> list:
    """Return a list of active control flag names."""
    flag_map = {
        "is_large_transaction":  "LARGE_TRANSACTION",
        "is_duplicate_invoice":  "DUPLICATE_INVOICE",
        "is_missing_reference":  "MISSING_REFERENCE",
        "is_approval_required":  "APPROVAL_REQUIRED",
        "is_negative_amount":    "NEGATIVE_AMOUNT",
        "is_round_amount_anomaly": "ROUND_AMOUNT_ANOMALY",
    }
    return [label for col, label in flag_map.items() if row.get(col, False)]


# ─── Public API ───────────────────────────────────────────────────────────────

def apply_controls(results_df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply all financial control rules to the reconciliation results DataFrame.

    Parameters
    ----------
    results_df : Output from matcher.reconcile()

    Returns
    -------
    DataFrame with additional control flag columns and a consolidated
    'control_alerts' column (pipe-separated human-readable alerts).
    """
    print("\n[CONTROLS] Applying financial control rules...")

    df = results_df.copy()

    # Apply each rule
    df = _rule_large_transaction(df)
    df = _rule_duplicate_invoice(df)
    df = _rule_missing_reference(df)
    df = _rule_approval_required(df)
    df = _rule_negative_amount(df)
    df = _rule_round_amount_anomaly(df)

    # Aggregate all alerts into one column
    df["control_alerts"] = df.apply(_build_control_alerts_summary, axis=1)
    df["control_flags"]  = df.apply(_build_control_flags_list,    axis=1)
    df["has_control_flag"] = df["control_flags"].apply(lambda x: len(x) > 0)

    # Drop intermediate alert columns (keep only the summary)
    drop_cols = [c for c in df.columns if c.startswith("control_alert_")]
    df = df.drop(columns=drop_cols)

    # Report
    print(f"  Transactions with control flags: {df['has_control_flag'].sum()}")
    for flag_col in ["is_large_transaction", "is_duplicate_invoice", "is_missing_reference",
                     "is_approval_required", "is_negative_amount", "is_round_amount_anomaly"]:
        if flag_col in df.columns:
            count = df[flag_col].sum()
            if count > 0:
                print(f"    {flag_col:30s}: {count}")

    return df


def get_controls_summary(df: pd.DataFrame) -> dict:
    """Return counts for each control flag type."""
    return {
        "large_transactions":    int(df.get("is_large_transaction",    pd.Series(dtype=bool)).sum()),
        "duplicate_invoices":    int(df.get("is_duplicate_invoice",    pd.Series(dtype=bool)).sum()),
        "missing_references":    int(df.get("is_missing_reference",    pd.Series(dtype=bool)).sum()),
        "approval_required":     int(df.get("is_approval_required",    pd.Series(dtype=bool)).sum()),
        "negative_amounts":      int(df.get("is_negative_amount",      pd.Series(dtype=bool)).sum()),
        "round_amount_anomalies":int(df.get("is_round_amount_anomaly", pd.Series(dtype=bool)).sum()),
        "total_flagged":         int(df.get("has_control_flag",        pd.Series(dtype=bool)).sum()),
    }
