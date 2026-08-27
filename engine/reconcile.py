"""
reconcile.py
------------
CLI Orchestrator for the Finance Transaction Reconciliation Engine.

Usage:
  python reconcile.py --bank <path_to_bank.csv> --ledger <path_to_ledger.csv> [--output <path.json>]

The output is a single JSON object written to:
  1. The specified --output file (if provided)
  2. stdout (always) — so the Express.js backend can consume it via child_process.spawn

Exit codes:
  0 — Success
  1 — File not found / schema error
  2 — Unexpected engine error
"""

import sys
import json
import argparse
import traceback
import uuid
from pathlib import Path

# Add the engine directory to path so modules can import each other
sys.path.insert(0, str(Path(__file__).parent))

from loader  import load_both, get_load_summary, LoaderError
from matcher import reconcile
from controls import apply_controls
from summary import build_output, print_summary_table


def parse_args():
    parser = argparse.ArgumentParser(
        description="Finance Transaction Reconciliation Engine"
    )
    parser.add_argument(
        "--bank",    required=True,
        help="Path to bank statement CSV file"
    )
    parser.add_argument(
        "--ledger",  required=True,
        help="Path to company ledger CSV file"
    )
    parser.add_argument(
        "--output",  required=False, default=None,
        help="Optional: path to write JSON output file"
    )
    parser.add_argument(
        "--session-id", required=False, default=None,
        help="Optional: session identifier to embed in output"
    )
    parser.add_argument(
        "--quiet",  action="store_true",
        help="Suppress progress output (stdout will be JSON only)"
    )
    return parser.parse_args()


def run(bank_path: str, ledger_path: str,
        output_path: str = None,
        session_id: str  = None,
        quiet: bool      = False) -> dict:
    """
    Execute the full reconciliation pipeline.

    Returns the output dict. Also writes to output_path if specified.
    """
    if session_id is None:
        session_id = str(uuid.uuid4())

    # ── Step 1: Load CSVs ──────────────────────────────────────────────────────
    if not quiet:
        print(f"\n{'='*60}")
        print("  FINANCE TRANSACTION RECONCILIATION ENGINE")
        print(f"{'='*60}")
        print(f"  Session ID : {session_id}")
        print(f"  Bank file  : {bank_path}")
        print(f"  Ledger file: {ledger_path}")
        print(f"{'='*60}\n")

    bank_df, ledger_df = load_both(bank_path, ledger_path)
    load_info = get_load_summary(bank_df, ledger_df)

    if not quiet:
        print(f"\n[LOADER] Load summary:")
        print(f"  Bank   : {load_info['bank']['total_rows']} rows, "
              f"${load_info['bank']['total_amount']:,.2f} total, "
              f"period {load_info['bank']['date_range']['from']} to {load_info['bank']['date_range']['to']}")
        print(f"  Ledger : {load_info['ledger']['total_rows']} rows, "
              f"${load_info['ledger']['total_amount']:,.2f} total, "
              f"period {load_info['ledger']['date_range']['from']} to {load_info['ledger']['date_range']['to']}")

    # ── Step 2: Reconcile ─────────────────────────────────────────────────────
    results_df = reconcile(bank_df, ledger_df)

    # ── Step 3: Apply financial controls ─────────────────────────────────────
    results_with_controls = apply_controls(results_df)

    # ── Step 4: Build output JSON ─────────────────────────────────────────────
    output = build_output(results_with_controls, session_id=session_id)

    # Attach load info
    output["load_summary"] = load_info

    if not quiet:
        print_summary_table(output)

    # ── Step 5: Write JSON output ─────────────────────────────────────────────
    if output_path:
        from pathlib import Path
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, default=str)
        if not quiet:
            print(f"\n[OUTPUT] Results written to: {output_path}")

    return output


def main():
    args = parse_args()

    try:
        output = run(
            bank_path   = args.bank,
            ledger_path = args.ledger,
            output_path = args.output,
            session_id  = args.session_id,
            quiet       = args.quiet,
        )

        # Always write JSON to stdout for Express child_process.spawn consumption
        print("\n__JSON_OUTPUT_START__")
        print(json.dumps(output, default=str))
        print("__JSON_OUTPUT_END__")

        sys.exit(0)

    except LoaderError as e:
        error_payload = {"error": "LOADER_ERROR", "message": str(e)}
        print(json.dumps(error_payload), file=sys.stderr)
        sys.exit(1)

    except Exception as e:
        error_payload = {
            "error": "ENGINE_ERROR",
            "message": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_payload), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
