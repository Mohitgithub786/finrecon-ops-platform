"""
loader.py
---------
Responsible for ingesting raw CSV files (bank statement + ledger),
validating structure, normalizing data types, and returning clean
DataFrames ready for the reconciliation matcher.

Normalization steps:
  1. Column header standardization (lowercase, strip whitespace)
  2. Date parsing to datetime objects
  3. Amount coercion to float, rounded to 2 decimal places
  4. String fields: stripped and uppercased where needed
  5. Missing value handling
  6. Schema validation (required columns must exist)
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Tuple


# ─── Required column schemas ──────────────────────────────────────────────────

BANK_REQUIRED_COLS = {
    "bank_txn_id",
    "invoice_id",
    "reference_id",
    "vendor",
    "amount",
    "date",
}

LEDGER_REQUIRED_COLS = {
    "ledger_txn_id",
    "invoice_id",
    "reference_id",
    "vendor",
    "amount",
    "date",
}


# ─── Validation ───────────────────────────────────────────────────────────────

class LoaderError(Exception):
    """Raised when CSV cannot be loaded or is structurally invalid."""
    pass


def _validate_schema(df: pd.DataFrame, required_cols: set, source: str) -> None:
    """Checks that all required columns exist in the DataFrame."""
    missing = required_cols - set(df.columns)
    if missing:
        raise LoaderError(
            f"[{source}] Missing required columns: {sorted(missing)}. "
            f"Found columns: {sorted(df.columns.tolist())}"
        )


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Strip and lowercase all column names."""
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df


def _parse_dates(df: pd.DataFrame, date_col: str, source: str) -> pd.DataFrame:
    """Parse date column to datetime; invalid dates become NaT."""
    try:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    except Exception as e:
        raise LoaderError(f"[{source}] Failed to parse date column '{date_col}': {e}")
    
    n_bad = df[date_col].isna().sum()
    if n_bad > 0:
        print(f"  [WARN][{source}] {n_bad} rows have unparseable dates — set to NaT.")
    return df


def _normalize_amounts(df: pd.DataFrame, amount_col: str, source: str) -> pd.DataFrame:
    """Coerce amount to float, round to 2 decimal places."""
    df[amount_col] = pd.to_numeric(df[amount_col], errors="coerce")
    n_bad = df[amount_col].isna().sum()
    if n_bad > 0:
        print(f"  [WARN][{source}] {n_bad} rows have non-numeric amounts — set to NaN.")
    df[amount_col] = df[amount_col].round(2)
    return df


def _normalize_strings(df: pd.DataFrame, str_cols: list) -> pd.DataFrame:
    """Strip whitespace from string fields; fill NaN strings with empty string."""
    for col in str_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()
            df[col] = df[col].replace("nan", "")
    return df


def _add_load_metadata(df: pd.DataFrame, source_label: str) -> pd.DataFrame:
    """Attach metadata columns for traceability."""
    df["_source"] = source_label
    df["_load_ts"] = datetime.now().isoformat()
    return df


# ─── Public API ───────────────────────────────────────────────────────────────

def load_bank_csv(filepath: str) -> pd.DataFrame:
    """
    Load and normalize a bank statement CSV.

    Returns a clean DataFrame with consistent types and column names.
    Raises LoaderError if the file is missing required columns.
    """
    print(f"[LOADER] Loading bank statement: {filepath}")
    try:
        df = pd.read_csv(filepath, dtype=str)
    except FileNotFoundError:
        raise LoaderError(f"Bank CSV not found: {filepath}")
    except Exception as e:
        raise LoaderError(f"Failed to read bank CSV '{filepath}': {e}")

    df = _normalize_columns(df)
    _validate_schema(df, BANK_REQUIRED_COLS, "bank")

    df = _parse_dates(df, "date", "bank")
    df = _normalize_amounts(df, "amount", "bank")
    df = _normalize_strings(df, ["invoice_id", "reference_id", "vendor",
                                  "department", "category", "description"])
    df = _add_load_metadata(df, "bank")

    print(f"  Loaded {len(df)} bank transactions.")
    return df.reset_index(drop=True)


def load_ledger_csv(filepath: str) -> pd.DataFrame:
    """
    Load and normalize a company ledger CSV.

    Returns a clean DataFrame with consistent types and column names.
    Raises LoaderError if the file is missing required columns.
    """
    print(f"[LOADER] Loading ledger: {filepath}")
    try:
        df = pd.read_csv(filepath, dtype=str)
    except FileNotFoundError:
        raise LoaderError(f"Ledger CSV not found: {filepath}")
    except Exception as e:
        raise LoaderError(f"Failed to read ledger CSV '{filepath}': {e}")

    df = _normalize_columns(df)
    _validate_schema(df, LEDGER_REQUIRED_COLS, "ledger")

    df = _parse_dates(df, "date", "ledger")
    df = _normalize_amounts(df, "amount", "ledger")
    df = _normalize_strings(df, ["invoice_id", "reference_id", "vendor",
                                  "department", "category", "description"])
    df = _add_load_metadata(df, "ledger")

    print(f"  Loaded {len(df)} ledger transactions.")
    return df.reset_index(drop=True)


def load_both(bank_path: str, ledger_path: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Convenience wrapper: load and validate both CSVs."""
    bank_df   = load_bank_csv(bank_path)
    ledger_df = load_ledger_csv(ledger_path)
    return bank_df, ledger_df


def get_load_summary(bank_df: pd.DataFrame, ledger_df: pd.DataFrame) -> dict:
    """Return a quick summary of what was loaded, for API response."""
    return {
        "bank": {
            "total_rows":       len(bank_df),
            "date_range":       {
                "from": str(bank_df["date"].min().date()) if not bank_df["date"].isna().all() else None,
                "to":   str(bank_df["date"].max().date()) if not bank_df["date"].isna().all() else None,
            },
            "total_amount":     round(float(bank_df["amount"].sum()), 2),
            "null_amounts":     int(bank_df["amount"].isna().sum()),
            "null_dates":       int(bank_df["date"].isna().sum()),
        },
        "ledger": {
            "total_rows":       len(ledger_df),
            "date_range":       {
                "from": str(ledger_df["date"].min().date()) if not ledger_df["date"].isna().all() else None,
                "to":   str(ledger_df["date"].max().date()) if not ledger_df["date"].isna().all() else None,
            },
            "total_amount":     round(float(ledger_df["amount"].sum()), 2),
            "null_amounts":     int(ledger_df["amount"].isna().sum()),
            "null_dates":       int(ledger_df["date"].isna().sum()),
        }
    }
