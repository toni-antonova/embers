#!/usr/bin/env python3
"""
Analysis Checkpoint 3 — Cache Effectiveness

Evaluates the two-tier cache (in-memory LRU + Cloud Storage) by analysing
server logs across five dimensions:

  1. Cache hit rate (memory / storage / miss)
  2. Cache miss analysis (ranked uncached concepts)
  3. Normalization failure review
  4. Cost projection at 100 / 1K / 10K users
  5. Latency comparison across the three tiers

Usage
─────
  # Dry-run with synthetic data (no live server needed)
  python analyze.py --dry-run

  # Against real structured-log export
  python analyze.py --log-file /path/to/server.jsonl

  # Against live cache stats endpoint
  python analyze.py --cache-stats-url https://lumen-…/cache/stats

  # With session JSONs from the client SessionLogger
  python analyze.py --sessions-dir ../sessions
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import textwrap
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


# ── Data models ──────────────────────────────────────────────────────────────


@dataclass
class RequestEvent:
    """A single cache lookup event parsed from structured logs."""

    raw_text: str
    normalized_key: str
    tier: str  # "memory" | "storage" | "miss"
    latency_ms: float
    pipeline: str = "unknown"


@dataclass
class AnalysisReport:
    """Collection of all analysis results."""

    # Analysis 1: hit rates
    total_requests: int = 0
    memory_hits: int = 0
    storage_hits: int = 0
    misses: int = 0

    # Analysis 2: uncached concepts
    miss_concepts: Counter = field(default_factory=Counter)

    # Analysis 3: normalization failures
    normalization_issues: list[dict] = field(default_factory=list)

    # Analysis 4: cost projection
    cost_per_generation: float = 0.0002  # USD
    generation_count: int = 0

    # Analysis 5: latency distributions
    memory_latencies: list[float] = field(default_factory=list)
    storage_latencies: list[float] = field(default_factory=list)
    miss_latencies: list[float] = field(default_factory=list)


# ── Normalization checks ────────────────────────────────────────────────────

_ARTICLES = frozenset({"a", "an", "the"})


def _normalize_key(text: str) -> str:
    """Replicate ShapeCache.normalize_key for comparison."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    words = [w for w in text.split() if w not in _ARTICLES]
    return " ".join(words).strip()


def _check_normalization(raw: str, normalized: str) -> dict | None:
    """Flag cases where normalization may be incorrect."""
    expected = _normalize_key(raw)

    # Exact match — no issue
    if expected == normalized:
        return None

    return {
        "raw_input": raw,
        "expected_normalized": expected,
        "actual_normalized": normalized,
        "issue": "normalization mismatch",
    }


# ── Log parsing ─────────────────────────────────────────────────────────────


def parse_log_file(log_path: str) -> list[RequestEvent]:
    """Parse JSON-structured server logs into RequestEvent list.

    Expected log fields (from structlog JSON output):
      - event: "cache_memory_hit" | "cache_storage_hit" | "cache_miss" |
               "generated" | "primary_pipeline_complete" | "fallback_pipeline_complete"
      - text: the original input text
      - normalized_key (optional): the normalized cache key
      - time_ms (optional): latency in milliseconds
      - pipeline (optional): "partcrafter" | "hunyuan3d_grounded_sam" | "mock"
    """
    events: list[RequestEvent] = []

    with open(log_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_name = entry.get("event", "")
            text = entry.get("text", "")

            if not text:
                continue

            normalized = entry.get("normalized_key", _normalize_key(text))
            latency = entry.get("time_ms", 0.0)
            pipeline = entry.get("pipeline", "unknown")

            if event_name in ("cache_memory_hit",):
                events.append(
                    RequestEvent(text, normalized, "memory", latency, pipeline)
                )
            elif event_name in ("cache_storage_hit",):
                events.append(
                    RequestEvent(text, normalized, "storage", latency, pipeline)
                )
            elif event_name in (
                "cache_miss",
                "generated",
                "primary_pipeline_complete",
                "fallback_pipeline_complete",
                "all_pipelines_failed_using_mock",
            ):
                events.append(
                    RequestEvent(text, normalized, "miss", latency, pipeline)
                )

    return events


def parse_sessions_dir(sessions_dir: str) -> list[RequestEvent]:
    """Parse client SessionLogger JSON files for request events."""
    events: list[RequestEvent] = []
    sessions_path = Path(sessions_dir)

    if not sessions_path.exists():
        print(
            f"  ⚠ Sessions directory '{sessions_dir}' not found — "
            "skipping session data."
        )
        return events

    json_files = list(sessions_path.glob("*.json"))
    if not json_files:
        print(
            f"  ⚠ No JSON files in '{sessions_dir}' — skipping session data."
        )
        return events

    for f in json_files:
        try:
            data = json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            continue

        for evt in data.get("events", []):
            if evt.get("type") == "generate_request":
                text = evt.get("text", "")
                cached = evt.get("cached", False)
                latency = evt.get("latency_ms", 0.0)
                tier = "memory" if cached else "miss"
                events.append(
                    RequestEvent(
                        text, _normalize_key(text), tier, latency
                    )
                )

    return events


# ── Synthetic data for dry-run ──────────────────────────────────────────────


def generate_synthetic_events(n: int = 200) -> list[RequestEvent]:
    """Generate realistic synthetic events for testing."""
    common = [
        "horse",
        "dog",
        "cat",
        "bird",
        "fish",
        "car",
        "tree",
        "flower",
        "house",
        "chair",
        "robot",
        "dragon",
        "airplane",
        "guitar",
        "butterfly",
    ]
    rare = [
        "pangolin",
        "axolotl",
        "narwhal",
        "quokka",
        "okapi",
    ]
    noisy = [
        "the horse",
        "A Cat",
        "my dog",
        "running horse",
        "beautiful butterfly",
        "12345",
        "asdfgh",
    ]

    events: list[RequestEvent] = []
    rng = random.Random(42)

    for _ in range(n):
        r = rng.random()
        if r < 0.5:
            text = rng.choice(common)
            tier = rng.choices(
                ["memory", "storage", "miss"], weights=[0.7, 0.2, 0.1]
            )[0]
        elif r < 0.8:
            text = rng.choice(noisy)
            tier = rng.choices(
                ["memory", "storage", "miss"], weights=[0.3, 0.3, 0.4]
            )[0]
        else:
            text = rng.choice(rare)
            tier = rng.choices(
                ["memory", "storage", "miss"], weights=[0.1, 0.2, 0.7]
            )[0]

        latency = {
            "memory": rng.uniform(0.1, 5.0),
            "storage": rng.uniform(30.0, 150.0),
            "miss": rng.uniform(1500.0, 4000.0),
        }[tier]

        normalized = _normalize_key(text)
        events.append(RequestEvent(text, normalized, tier, latency))

    return events


# ── Analyses ────────────────────────────────────────────────────────────────


def run_analysis(events: list[RequestEvent]) -> AnalysisReport:
    """Run all 5 analyses on the given events."""
    report = AnalysisReport()
    report.total_requests = len(events)

    for evt in events:
        if evt.tier == "memory":
            report.memory_hits += 1
            report.memory_latencies.append(evt.latency_ms)
        elif evt.tier == "storage":
            report.storage_hits += 1
            report.storage_latencies.append(evt.latency_ms)
        else:
            report.misses += 1
            report.miss_latencies.append(evt.latency_ms)
            report.miss_concepts[evt.normalized_key] += 1
            report.generation_count += 1

        # Check normalization
        issue = _check_normalization(evt.raw_text, evt.normalized_key)
        if issue:
            report.normalization_issues.append(issue)

    return report


# ── Output formatting ───────────────────────────────────────────────────────


def _pct(n: int, total: int) -> str:
    if total == 0:
        return "0.0%"
    return f"{n / total * 100:.1f}%"


def _percentile(data: list[float], p: float) -> float:
    if not data:
        return 0.0
    s = sorted(data)
    idx = int(len(s) * p)
    return s[min(idx, len(s) - 1)]


def format_report(report: AnalysisReport) -> str:
    """Format the analysis report as a text summary."""
    lines: list[str] = []
    lines.append("=" * 60)
    lines.append("  CHECKPOINT 3 — CACHE EFFECTIVENESS")
    lines.append("=" * 60)

    # ── Analysis 1: Cache Hit Rate ──────────────────────────────────
    lines.append("")
    lines.append("── ANALYSIS 1: Cache Hit Rate ──")
    total = report.total_requests
    hit_total = report.memory_hits + report.storage_hits
    lines.append(f"  Total requests:       {total}")
    lines.append(f"  Overall hit rate:     {_pct(hit_total, total)}")
    lines.append(f"    Memory hits:        {report.memory_hits} ({_pct(report.memory_hits, total)})")
    lines.append(f"    Storage hits:       {report.storage_hits} ({_pct(report.storage_hits, total)})")
    lines.append(f"    Cache misses:       {report.misses} ({_pct(report.misses, total)})")

    # ── Analysis 2: Cache Miss Analysis ─────────────────────────────
    lines.append("")
    lines.append("── ANALYSIS 2: Cache Miss Analysis ──")
    top_misses = report.miss_concepts.most_common(15)
    if top_misses:
        lines.append("  Top uncached concepts (by request count):")
        for i, (concept, count) in enumerate(top_misses, 1):
            lines.append(f"    {i:2d}. {concept!r:25s}  ×{count}")
        lines.append("")
        lines.append("  Recommendation: Add these to pre-generation list:")
        for concept, count in top_misses[:5]:
            lines.append(f"    - {concept} ({count} misses)")
    else:
        lines.append("  No cache misses recorded.")

    # ── Analysis 3: Normalization Failures ──────────────────────────
    lines.append("")
    lines.append("── ANALYSIS 3: Normalization Failures ──")
    if report.normalization_issues:
        unique_issues: dict[str, dict] = {}
        for issue in report.normalization_issues:
            key = f"{issue['raw_input']}|{issue['actual_normalized']}"
            unique_issues[key] = issue

        lines.append(f"  {len(unique_issues)} unique normalization issue(s):")
        for issue in list(unique_issues.values())[:10]:
            lines.append(
                f"    '{issue['raw_input']}' → expected '{issue['expected_normalized']}' "
                f"but got '{issue['actual_normalized']}'"
            )
    else:
        lines.append("  No normalization issues detected.")

    # ── Analysis 4: Cost Projection ─────────────────────────────────
    lines.append("")
    lines.append("── ANALYSIS 4: Cost Projection ──")
    cost_per_gen = report.cost_per_generation
    if total > 0 and report.misses > 0:
        miss_rate = report.misses / total

        scenarios = [
            ("Current usage", total, total // 30),
            ("100 users", 500, 500),
            ("1,000 users", 2_000, 2_000),
            ("10,000 users", 5_000, 5_000),
        ]

        lines.append(f"  Cost per generation:  ${cost_per_gen}")
        lines.append(f"  Current miss rate:    {miss_rate:.1%}")
        lines.append("")
        lines.append(f"  {'Scenario':<20s} {'Concepts/day':>14s} {'Gens/day':>10s} {'$/month':>10s}")
        lines.append(f"  {'─' * 20} {'─' * 14} {'─' * 10} {'─' * 10}")

        for name, concepts_day, unique_day in scenarios:
            # Miss rate improves as cache fills
            effective_miss = miss_rate * 0.5 if unique_day > 500 else miss_rate
            gens_day = int(unique_day * effective_miss)
            monthly_cost = gens_day * 30 * cost_per_gen
            lines.append(
                f"  {name:<20s} {concepts_day:>14,d} {gens_day:>10,d} ${monthly_cost:>9.2f}"
            )
    else:
        lines.append("  Insufficient data for cost projection.")

    # ── Analysis 5: Latency Comparison ──────────────────────────────
    lines.append("")
    lines.append("── ANALYSIS 5: Latency Comparison ──")

    categories = [
        ("Memory cache hit", report.memory_latencies),
        ("Storage cache hit", report.storage_latencies),
        ("Full generation", report.miss_latencies),
    ]

    lines.append(f"  {'Category':<22s} {'Count':>6s} {'p50':>8s} {'p95':>8s} {'Mean':>8s}")
    lines.append(f"  {'─' * 22} {'─' * 6} {'─' * 8} {'─' * 8} {'─' * 8}")

    for name, latencies in categories:
        n = len(latencies)
        if n > 0:
            p50 = _percentile(latencies, 0.5)
            p95 = _percentile(latencies, 0.95)
            mean = sum(latencies) / n
            lines.append(
                f"  {name:<22s} {n:>6d} {p50:>7.1f}ms {p95:>7.1f}ms {mean:>7.1f}ms"
            )
        else:
            lines.append(f"  {name:<22s} {n:>6d}      -ms      -ms      -ms")

    # ── Summary ─────────────────────────────────────────────────────
    lines.append("")
    lines.append("=" * 60)
    lines.append("  SUMMARY & DECISIONS")
    lines.append("=" * 60)
    hit_rate_pct = (report.memory_hits + report.storage_hits) / max(total, 1) * 100

    if hit_rate_pct > 90:
        lines.append(f"  ✓ Cache hit rate {hit_rate_pct:.0f}% — caching is working well.")
    elif hit_rate_pct > 70:
        lines.append(f"  ~ Cache hit rate {hit_rate_pct:.0f}% — room for improvement.")
        lines.append("    → Expand pre-generation list with top miss concepts.")
    else:
        lines.append(f"  ✗ Cache hit rate {hit_rate_pct:.0f}% — below target.")
        lines.append("    → Significantly expand pre-generation list.")
        lines.append("    → Review normalization for systematic failures.")

    if report.normalization_issues:
        lines.append(f"  → Fix {len(report.normalization_issues)} normalization pattern(s).")

    if top_misses:
        concepts_to_add = [c for c, _ in top_misses[:5]]
        lines.append(f"  → Add to pre-generation: {', '.join(concepts_to_add)}")

    lines.append("")
    return "\n".join(lines)


def write_report(report_text: str, output_dir: str) -> str:
    """Write the report to a markdown file."""
    output_path = Path(output_dir) / "report.md"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        f.write("# Checkpoint 3 — Cache Effectiveness Report\n\n")
        f.write("```\n")
        f.write(report_text)
        f.write("```\n")

    return str(output_path)


# ── CLI ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analysis Checkpoint 3: Cache Effectiveness",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python analyze.py --dry-run
              python analyze.py --log-file /var/log/lumen/server.jsonl
              python analyze.py --cache-stats-url https://lumen-xyz/cache/stats
        """),
    )
    parser.add_argument(
        "--log-file",
        help="Path to JSON-structured server log export",
    )
    parser.add_argument(
        "--cache-stats-url",
        help="URL to GET /cache/stats endpoint",
    )
    parser.add_argument(
        "--sessions-dir",
        help="Path to directory of SessionLogger JSON files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run with synthetic data (no live server needed)",
    )

    args = parser.parse_args()

    # ── Collect events ──────────────────────────────────────────────
    events: list[RequestEvent] = []

    if args.dry_run:
        print("🧪 Dry-run mode — using synthetic data\n")
        events = generate_synthetic_events(200)
    else:
        if args.log_file:
            print(f"📄 Parsing log file: {args.log_file}")
            events.extend(parse_log_file(args.log_file))

        if args.sessions_dir:
            print(f"📁 Parsing sessions: {args.sessions_dir}")
            events.extend(parse_sessions_dir(args.sessions_dir))

        if args.cache_stats_url:
            print(f"🌐 Fetching cache stats from: {args.cache_stats_url}")
            try:
                import urllib.request

                with urllib.request.urlopen(args.cache_stats_url, timeout=5) as resp:
                    stats = json.loads(resp.read().decode())
                    print(f"   Cache stats: {json.dumps(stats, indent=2)}")
            except Exception as e:
                print(f"   ⚠ Could not fetch cache stats: {e}")

    if not events:
        print(
            "\n⚠ No events to analyze. Use --dry-run for a demo, "
            "or provide --log-file / --sessions-dir."
        )
        sys.exit(1)

    # ── Run analyses ────────────────────────────────────────────────
    print(f"\n📊 Analysing {len(events)} request events...\n")
    report = run_analysis(events)
    report_text = format_report(report)

    # ── Output ──────────────────────────────────────────────────────
    print(report_text)

    # Write report to file
    script_dir = Path(__file__).parent
    report_path = write_report(report_text, str(script_dir))
    print(f"📝 Report written to: {report_path}")


if __name__ == "__main__":
    main()
