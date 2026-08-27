"""
summary.py
----------
Computes the final reconciliation summary metrics and structures
the full output JSON for consumption by the Express API.

Outputs:
  - reconciliation_summary  : KPI-level metrics (match rate, discrepancy, counts)
  - exception_breakdown     : Per-status counts and total exception amount
  - controls_summary        : Financial control flag counts
  - exceptions_list         : All non-MATCHED rows as structured records (for exception queue)
  - all_transactions_list   : Full reconciliation results (for export)
  - trend_by_day            : Daily matched vs exception counts (for Recharts timeline)
  - amount_by_category      : Discrepancy amounts grouped by expense category
"""

import pandas as pd
import numpy as np
import json
from datetime import datetime
from matcher import (
    STATUS_MATCHED, STATUS_AMOUNT_MISMATCH, STATUS_DATE_MISMATCH,
    STATUS_MISSING_BANK, STATUS_MISSING_LEDGER, STATUS_DUPLICATE,
    get_status_counts
)
from controls import get_controls_summary


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_float(val) -> float:
    """Convert to float safely, returning 0.0 on NaN/None."""
    try:
        f = float(val)
        return 0.0 if np.isnan(f) else f
    except (TypeError, ValueError):
        return 0.0


def _row_to_dict(row: pd.Series) -> dict:
    """Convert a DataFrame row to a clean serializable dict."""
    d = {}
    for k, v in row.items():
        if isinstance(v, (pd.Timestamp,)):
            d[k] = str(v.date()) if not pd.isna(v) else None
        elif isinstance(v, float) and np.isnan(v):
            d[k] = None
        elif isinstance(v, (np.integer,)):
            d[k] = int(v)
        elif isinstance(v, (np.floating,)):
            d[k] = round(float(v), 2)
        elif isinstance(v, list):
            d[k] = v
        else:
            d[k] = v
    return d


# ─── Summary builders ─────────────────────────────────────────────────────────

def _build_reconciliation_summary(df: pd.DataFrame, status_counts: dict) -> dict:
    """Compute KPI-level metrics."""
    total_txns       = len(df)
    matched          = status_counts.get(STATUS_MATCHED, 0)
    total_exceptions = total_txns - matched
    match_rate       = round((matched / total_txns) * 100, 2) if total_txns > 0 else 0.0

    # Total financial discrepancy (sum of absolute amount differences)
    total_discrepancy = round(
        df["amount_discrepancy"].apply(abs).sum(), 2
    )

    # Bank-side total and ledger-side total
    bank_total   = round(df["bank_amount"].apply(_safe_float).sum(), 2)
    ledger_total = round(df["ledger_amount"].apply(_safe_float).sum(), 2)

    return {
        "total_transactions":    total_txns,
        "matched_transactions":  matched,
        "unmatched_transactions":total_exceptions,
        "exception_count":       total_exceptions,
        "match_rate_pct":        match_rate,
        "total_discrepancy_usd": total_discrepancy,
        "bank_total_usd":        bank_total,
        "ledger_total_usd":      ledger_total,
        "net_difference_usd":    round(bank_total - ledger_total, 2),
    }


def _build_exception_breakdown(df: pd.DataFrame, status_counts: dict) -> list:
    """Per-exception-type breakdown with total discrepancy amounts."""
    exception_statuses = [
        STATUS_AMOUNT_MISMATCH, STATUS_DATE_MISMATCH,
        STATUS_MISSING_BANK,    STATUS_MISSING_LEDGER, STATUS_DUPLICATE
    ]
    breakdown = []
    for status in exception_statuses:
        subset = df[df["reconciliation_status"] == status]
        breakdown.append({
            "status":          status,
            "count":           int(status_counts.get(status, 0)),
            "total_discrepancy": round(subset["amount_discrepancy"].apply(abs).sum(), 2),
        })
    return breakdown


def _build_trend_by_day(df: pd.DataFrame) -> list:
    """
    Group transactions by bank_date (or ledger_date if bank is absent)
    to produce a daily timeline of matched vs exception counts.
    """
    df2 = df.copy()
    df2["_effective_date"] = df2["bank_date"].replace("", None)
    df2.loc[df2["_effective_date"].isna(), "_effective_date"] = df2.loc[
        df2["_effective_date"].isna(), "ledger_date"
    ]
    df2 = df2.dropna(subset=["_effective_date"])
    df2["_effective_date"] = pd.to_datetime(df2["_effective_date"], errors="coerce")
    df2 = df2.dropna(subset=["_effective_date"])
    df2["_day"] = df2["_effective_date"].dt.date

    grouped = df2.groupby("_day").apply(
        lambda g: {
            "date":       str(g.name),
            "matched":    int((g["reconciliation_status"] == STATUS_MATCHED).sum()),
            "exceptions": int((g["reconciliation_status"] != STATUS_MATCHED).sum()),
            "total":      len(g),
        }
    ).tolist()

    return sorted(grouped, key=lambda x: x["date"])


def _build_amount_by_category(df: pd.DataFrame) -> list:
    """Discrepancy amount and transaction count grouped by expense category."""
    exceptions_df = df[df["reconciliation_status"] != STATUS_MATCHED].copy()
    if exceptions_df.empty:
        return []
    
    grouped = (
        exceptions_df.groupby("category")
        .agg(
            count=("invoice_id", "count"),
            total_discrepancy=("amount_discrepancy", lambda x: round(x.abs().sum(), 2))
        )
        .reset_index()
        .sort_values("total_discrepancy", ascending=False)
    )
    return grouped.to_dict(orient="records")


def _build_amount_by_department(df: pd.DataFrame) -> list:
    """Exception count grouped by department for drill-down."""
    exceptions_df = df[df["reconciliation_status"] != STATUS_MATCHED].copy()
    if exceptions_df.empty:
        return []
    grouped = (
        exceptions_df.groupby("department")
        .agg(
            exception_count=("invoice_id", "count"),
            total_discrepancy=("amount_discrepancy", lambda x: round(x.abs().sum(), 2))
        )
        .reset_index()
        .sort_values("exception_count", ascending=False)
    )
    return grouped.to_dict(orient="records")


def _build_exceptions_list(df: pd.DataFrame) -> list:
    """Return all non-MATCHED rows as a structured list for the exception queue."""
    exceptions_df = df[df["reconciliation_status"] != STATUS_MATCHED].copy()
    records = []
    for _, row in exceptions_df.iterrows():
        r = _row_to_dict(row)
        # Add default exception workflow fields (will be managed in MongoDB)
        r["exception_workflow_status"] = "PENDING"
        r["assigned_to"]               = None
        r["resolution_notes"]          = ""
        r["resolved_at"]               = None
        records.append(r)
    return records


def _build_all_transactions_list(df: pd.DataFrame) -> list:
    """Full transaction list for export."""
    records = []
    for _, row in df.iterrows():
        records.append(_row_to_dict(row))
    return records


# ─── Public API ───────────────────────────────────────────────────────────────

def build_output(results_df: pd.DataFrame, session_id: str = None) -> dict:
    """
    Build the complete reconciliation output JSON.

    Parameters
    ----------
    results_df : DataFrame from controls.apply_controls()
    session_id : Optional session identifier

    Returns
    -------
    dict : Full structured output for API response and MongoDB persistence.
    """
    print("\n[SUMMARY] Building reconciliation output...")

    status_counts = get_status_counts(results_df)
    controls_sum  = get_controls_summary(results_df)

    recon_summary      = _build_reconciliation_summary(results_df, status_counts)
    exception_breakdown = _build_exception_breakdown(results_df, status_counts)
    trend_by_day       = _build_trend_by_day(results_df)
    amount_by_category = _build_amount_by_category(results_df)
    amount_by_dept     = _build_amount_by_department(results_df)
    exceptions_list    = _build_exceptions_list(results_df)
    all_transactions   = _build_all_transactions_list(results_df)

    output = {
        "session_id":           session_id,
        "generated_at":         datetime.now().isoformat(),
        "reconciliation_summary": recon_summary,
        "exception_breakdown":   exception_breakdown,
        "controls_summary":      controls_sum,
        "charts": {
            "trend_by_day":       trend_by_day,
            "amount_by_category": amount_by_category,
            "amount_by_dept":     amount_by_dept,
            "status_distribution": [
                {"status": k, "count": v}
                for k, v in status_counts.items()
            ],
        },
        "exceptions":          exceptions_list,
        "all_transactions":    all_transactions,
    }

    print(f"  Match rate       : {recon_summary['match_rate_pct']}%")
    print(f"  Total exceptions : {recon_summary['exception_count']}")
    print(f"  Total discrepancy: ${recon_summary['total_discrepancy_usd']:,.2f}")
    print(f"  Control flags    : {controls_sum['total_flagged']}")

    return output


def print_summary_table(output: dict) -> None:
    """Pretty-print the reconciliation summary to terminal."""
    s = output["reconciliation_summary"]
    print("\n" + "="*60)
    print("  RECONCILIATION SUMMARY")
    print("="*60)
    print(f"  Total Transactions    : {s['total_transactions']:,}")
    print(f"  Matched               : {s['matched_transactions']:,}")
    print(f"  Exceptions            : {s['exception_count']:,}")
    print(f"  Match Rate            : {s['match_rate_pct']}%")
    print(f"  Total Discrepancy     : ${s['total_discrepancy_usd']:,.2f}")
    print(f"  Bank Total            : ${s['bank_total_usd']:,.2f}")
    print(f"  Ledger Total          : ${s['ledger_total_usd']:,.2f}")
    print(f"  Net Difference        : ${s['net_difference_usd']:,.2f}")
    print("-"*60)
    print("  EXCEPTION BREAKDOWN")
    for exc in output["exception_breakdown"]:
        print(f"  {exc['status']:25s}: {exc['count']:>5}  (${exc['total_discrepancy']:>10,.2f})")
    print("-"*60)
    print("  FINANCIAL CONTROLS")
    c = output["controls_summary"]
    print(f"  Large Transactions    : {c['large_transactions']}")
    print(f"  Duplicate Invoices    : {c['duplicate_invoices']}")
    print(f"  Missing References    : {c['missing_references']}")
    print(f"  Approval Required     : {c['approval_required']}")
    print(f"  Total Flagged         : {c['total_flagged']}")
    print("="*60)
