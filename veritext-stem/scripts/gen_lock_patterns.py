"""Generates shared/lock_patterns.json, the single source of the lock rules for both engines.

Run from veritext-stem/: ``python3 scripts/gen_lock_patterns.py``. Patterns are written as raw strings
here so they stay readable; they must use only syntax that Python ``re`` and JavaScript RegExp both
accept (no named groups, no inline flags, no \\p{...}, fixed-width lookbehind).
Order = priority: an earlier rule wins any overlap.
"""

from __future__ import annotations

import json
from pathlib import Path

EL = (
    "He|Li|Be|Ne|Na|Mg|Al|Si|Cl|Ar|Ca|Sc|Ti|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Zr|Nb|Mo|Tc|Ru|Rh|"
    "Pd|Ag|Cd|In|Sn|Sb|Te|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|Re|Os|Ir|Pt|Au|Hg|"
    "Tl|Pb|Bi|Po|At|Rn|Fr|Ra|Ac|Th|Pa|Np|Pu|Am|Cm|Bk|Cf|Es|Fm|Md|No|Lr|H|B|C|N|O|F|P|S|K|V|Y|I|W|U"
)
NUMCORE = r"\d+(?:[.,]\d+)*(?:[eE][-−+]?\d+)?(?:\s?[×x]\s?10(?:\^\{?[-−]?\d+\}?|[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?(?:\^\{?[-−]?\d+\}?)?"
ATOM = (
    r"(?:[yzafpnµμumcdkMGTP]?(?:mol|Hz|Pa|eV|Da|bp|nt|lx|Gy|Sv|Wb|rad|sr|bar|atm|cal|L|l|m|g|s|M|J|W|V|A|N|K|T|F|C|S|H|Ω|ohm)"
    r"|°C|°F|°|%|‰|ppm|ppb|rpm|min|h|d|yr|wt%|vol%|mol%)"
)
EXP = r"(?:\^\{?[-−]?\d+\}?|[⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+|[-−]\d+)"
UNIT = rf"(?:\s?{ATOM}{EXP}?(?:\s?[/·]\s?{ATOM}{EXP}?|\s{ATOM}{EXP})*(?![A-Za-z]))"
NUMBER = (
    rf"(?<![A-Za-z0-9.])[-−+]?{NUMCORE}(?:\s?(?:±|\+/-|–|−)\s?{NUMCORE})?{UNIT}?"
)

RULES: list[dict[str, object]] = [
    {"id": "escape-brackets", "kind": "X", "pattern": r"[⟦⟧]"},
    {"id": "md-code-fence", "kind": "K", "pattern": r"^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$", "flags": "m"},
    {"id": "latex-verbatim", "kind": "K", "pattern": r"\\begin\{(verbatim|lstlisting|minted|Verbatim)\}[\s\S]*?\\end\{\1\}"},
    {"id": "latex-float", "kind": "K", "pattern": r"\\begin\{(figure|table|tabular|thebibliography|tikzpicture|algorithm)(\*?)\}[\s\S]*?\\end\{\1\2\}"},
    {"id": "latex-math-env", "kind": "M", "pattern": r"\\begin\{(equation|align|gather|multline|eqnarray|displaymath|math|split|alignat|flalign)(\*?)\}[\s\S]*?\\end\{\1\2\}"},
    {"id": "display-math-dollars", "kind": "M", "pattern": r"\$\$[\s\S]+?\$\$"},
    {"id": "display-math-brackets", "kind": "M", "pattern": r"\\\[[\s\S]+?\\\]"},
    {"id": "inline-math-parens", "kind": "M", "pattern": r"\\\([\s\S]+?\\\)"},
    {"id": "inline-code", "kind": "K", "pattern": r"`[^`\n]+`"},
    {"id": "url", "kind": "U", "pattern": r"(?:https?|ftp)://[^\s<>\"'\]\)]*[^\s<>\"'\]\).,;:!?]"},
    {"id": "doi", "kind": "U", "pattern": r"(?:doi:\s?)?(?<![A-Za-z0-9/])10\.\d{4,9}/[^\s<>\"']*[^\s<>\"'.,;:!?)\]]"},
    {"id": "latex-cite", "kind": "C", "pattern": r"\\(?:cite|citep|citet|citealp|citealt|citeauthor|citeyear|parencite|textcite|autocite|footcite)\*?(?:\[[^\]]*\]){0,2}\{[^}]*\}"},
    {"id": "latex-ref", "kind": "R", "pattern": r"\\(?:ref|eqref|autoref|cref|Cref|pageref|label)\{[^}]*\}"},
    {"id": "inline-math-dollar", "kind": "M", "pattern": r"(?<![\\$])\$(?![\s$])(?:[^$\n\\]|\\.)+?(?<![\s\\])\$(?!\d)"},
    {"id": "numeric-citation", "kind": "C", "pattern": r"\[\d+(?:\s?[-–,]\s?\d+)*\]"},
    {"id": "md-footnote", "kind": "C", "pattern": r"\[\^[^\]\s]+\]"},
    {"id": "author-year-citation", "kind": "C", "pattern": r"\((?:see |e\.g\.,? |cf\. )?[A-Z][^()\n]{0,80}?(?:19|20)\d{2}[a-z]?(?:,\s?pp?\.\s?\d+(?:[-–]\d+)?)?\)"},
    {"id": "narrative-citation", "kind": "C", "pattern": r"(?<![A-Za-z])[A-Z][A-Za-z'’\-]+(?: et al\.| and [A-Z][A-Za-z'’\-]+| & [A-Z][A-Za-z'’\-]+)? \((?:19|20)\d{2}[a-z]?\)"},
    {"id": "figure-table-ref", "kind": "R", "pattern": r"(?<![A-Za-z])(?:Supplementary (?:Fig\.|Figure|Table)s?|Figs?\.|Figures?|Tables?|Eqs?\.|Equations?|Sections?|Sec\.|Appendix)\s?~?\(?[A-Z]?\d+(?:\.\d+)*[a-z]?\)?(?:\s?(?:and|[-–,])\s?\(?[A-Z]?\d+[a-z]?\)?)?"},
    {"id": "md-heading-marker", "kind": "K", "pattern": r"^#{1,6}[ \t]+", "flags": "m"},
    {"id": "md-list-marker", "kind": "K", "pattern": r"^[ \t]*(?:[-*+]|\d+[.)])[ \t]+", "flags": "m"},
    {"id": "html-tag", "kind": "K", "pattern": r"</?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?/?>"},
    {"id": "latex-comment", "kind": "K", "pattern": r"(?<!\\)%[^\n]*", "formats": ["latex"]},
    {"id": "latex-command", "kind": "K", "pattern": r"\\[A-Za-z]+\*?(?:\[[^\]\n]*\])*(?:\{[^{}\n]*(?:\{[^{}\n]*\}[^{}\n]*)*\})*"},
    {"id": "latex-escape", "kind": "K", "pattern": r"\\[^A-Za-z\s]"},
    {"id": "ph-value", "kind": "N", "pattern": r"(?<![A-Za-z])pH\s?\d+(?:\.\d+)?"},
    {"id": "species-abbrev", "kind": "E", "pattern": r"(?<![A-Za-z.])[A-Z]\.\s?[a-z]{3,}(?![A-Za-z])"},
    {"id": "gene-hyphenated", "kind": "E", "pattern": r"(?<![A-Za-z0-9])[A-Z][A-Za-z0-9]{1,}(?:-[A-Za-z0-9α-ω]+)*-(?:\d+[A-Za-z]?|[α-ω])(?![A-Za-z0-9])"},
    {"id": "dimension", "kind": "N", "pattern": r"(?<![A-Za-z0-9.])\d[Dd](?![A-Za-z0-9])"},
    {"id": "chemical-formula", "kind": "E", "filter": "formula",
     "pattern": rf"(?<![A-Za-z0-9])(?:(?:{EL})\d*|\((?:(?:{EL})\d*)+\)\d*)+(?:\d*[+−-](?![A-Za-z0-9]))?(?![a-z0-9])"},
    {"id": "gene-symbol", "kind": "E", "pattern": r"(?<![A-Za-z0-9])(?:[A-Z][A-Za-z]{0,6}\d+[A-Za-z]?|p\d{2,3}|m[A-Z]{2,}\d*)\+?(?![A-Za-z0-9])"},
    {"id": "acronym", "kind": "A", "filter": "acronym", "pattern": r"(?<![A-Za-z0-9])[A-Z][A-Z0-9]{1,7}s?(?![A-Za-z0-9])"},
    {"id": "number-with-unit", "kind": "N", "pattern": NUMBER},
]

if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "shared" / "lock_patterns.json"
    payload = {
        "_comment": "GENERATED by scripts/gen_lock_patterns.py; edit that file, not this one. Order = priority.",
        "rules": RULES,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(RULES)} rules)")
