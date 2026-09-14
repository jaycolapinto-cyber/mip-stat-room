"""
Builds the workbook Jay reviews to decide which duplicate identities to merge.

The point of the file is that the question is ANSWERABLE without opening the
site. A bare list of name pairs is not: "is Tori W the same as Wiktoria W?"
has no answer on its own. What makes it answerable is the evidence beside each
pair - how many of their games are literally the same game, whether they have
ever been on court together, when each record starts and stops - plus a plain
reading of what that evidence means, so the sheet can be worked through
quickly rather than puzzled over.

Nothing here decides anything. Column A is a dropdown, it starts blank for
every row that is not already proven, and a blank stays unmerged.

Run:  python build/dupebook.py
In:   build/dupesweep.json   (written by build/dupesweep.mjs)
Out:  /mnt/user-data/outputs/MIP-duplicate-players.xlsx
"""
import json
import pathlib
from datetime import date

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = pathlib.Path(__file__).resolve().parents[1]
SWEEP = json.loads((ROOT / "build/dupesweep.json").read_text())
ALIASES = json.loads((ROOT / "importer/aliases.json").read_text(encoding="utf-8"))
OUT = pathlib.Path("/mnt/user-data/outputs/MIP-duplicate-players.xlsx")

ARIAL = "Arial"
INK = "0D1A15"
COURT = "0A3B2C"
MUTED = "64756D"
HEAD_FILL = PatternFill("solid", fgColor=COURT)
FILL_ME = PatternFill("solid", fgColor="FFF6C2")
PROVEN = PatternFill("solid", fgColor="E4F4EC")
FAMILY = PatternFill("solid", fgColor="F7F9F6")
RULED = PatternFill("solid", fgColor="FBEAE8")
THIN = Side(style="thin", color="E2E8E2")
BOX = Border(bottom=THIN)


def head(ws, row, labels, widths):
    for i, text in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=text)
        c.font = Font(name=ARIAL, size=9.5, bold=True, color="FFFFFF")
        c.fill = HEAD_FILL
        c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[row].height = 30
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def title(ws, text, sub):
    ws["A1"] = text
    ws["A1"].font = Font(name=ARIAL, size=15, bold=True, color=INK)
    ws["A2"] = sub
    ws["A2"].font = Font(name=ARIAL, size=10, italic=True, color=MUTED)
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")


wb = Workbook()

# ===================================================================== review
ws = wb.active
ws.title = "Review these"
cands = SWEEP["candidates"]
proven = [c for c in cands if c["confidence"] == "Certain"]
maybe = [c for c in cands if c["confidence"] not in ("Certain",)]

title(
    ws,
    "Merrick In A Pickle - one player, two names?",
    "Fill in column A only. The rows at the top are already proven by the games and are pre-filled MERGE - "
    "change one only if you know better. Everything below is a judgement call and starts blank; a blank row "
    "is left alone. 'Keeps this name' is the name that survives - change it in column B if the other spelling "
    "is the right one. Send the file back and the merges are applied.",
)
ws.merge_cells("A2:N2")
ws.row_dimensions[2].height = 56

LABELS = [
    "DECISION", "Keeps this name", "Games", "Folds in", "Games",
    "What the games say", "Same game, one name swapped", "Ever on court together?",
    "Nights both played", "Record 1 runs", "Record 2 runs",
    "How the names relate", "Plain reading", "Confidence",
]
WIDTHS = [16, 22, 8, 22, 8, 54, 12, 13, 11, 22, 22, 30, 34, 11]
head(ws, 4, LABELS, WIDTHS)
ws.freeze_panes = "A5"

row = 5


def write_block(rows, banner, fill, prefill):
    global row
    c = ws.cell(row=row, column=1, value=banner)
    c.font = Font(name=ARIAL, size=10, bold=True, color=COURT)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=14)
    row += 1
    first = row
    for r in rows:
        ws.cell(row=row, column=1, value=prefill or None)
        ws.cell(row=row, column=2, value=r["keepName"])
        ws.cell(row=row, column=3, value=r["keepGames"])
        ws.cell(row=row, column=4, value=r["foldName"])
        ws.cell(row=row, column=5, value=r["foldGames"])
        ws.cell(row=row, column=6, value=r["why"])
        ws.cell(row=row, column=7, value=r["twin"])
        ws.cell(row=row, column=8, value="YES - two people" if r["together"] else "never")
        ws.cell(row=row, column=9, value=r["sharedDates"])
        ws.cell(row=row, column=10, value=f'{r["keepFirst"]} to {r["keepLast"]}')
        ws.cell(row=row, column=11, value=f'{r["foldFirst"]} to {r["foldLast"]}')
        ws.cell(row=row, column=12, value=r["nameSignal"])
        ws.cell(row=row, column=13, value=r["hint"])
        ws.cell(row=row, column=14, value=r["confidence"])
        for col in range(1, 15):
            cell = ws.cell(row=row, column=col)
            cell.font = Font(name=ARIAL, size=10, color=INK)
            cell.border = BOX
            cell.alignment = Alignment(vertical="top", wrap_text=(col in (6, 12, 13)))
        ws.cell(row=row, column=1).fill = fill
        ws.cell(row=row, column=1).font = Font(name=ARIAL, size=10, bold=True, color=INK)
        ws.cell(row=row, column=3).alignment = Alignment(horizontal="right")
        ws.cell(row=row, column=5).alignment = Alignment(horizontal="right")
        ws.cell(row=row, column=7).alignment = Alignment(horizontal="right")
        ws.row_dimensions[row].height = 30
        row += 1
    return first, row - 1


ws.cell(row=row, column=1)
p_first, p_last = write_block(
    proven,
    f"PROVEN BY THE GAMES - {len(proven)} pairs. Their games include the same game twice, "
    "once under each name. Pre-filled MERGE.",
    PROVEN, "MERGE",
)
row += 1
m_first, m_last = write_block(
    maybe,
    f"YOUR CALL - {len(maybe)} pairs. The names look related but the games neither prove nor "
    "disprove it. Most of these are families. Blank = leave alone.",
    FILL_ME, None,
)

dv = DataValidation(type="list", formula1='"MERGE,KEEP SEPARATE,NOT SURE"', allow_blank=True)
dv.showErrorMessage = False
dv.prompt = "MERGE = one person. KEEP SEPARATE = two people. Blank = leave alone."
dv.promptTitle = "Decision"
dv.showInputMessage = True
ws.add_data_validation(dv)
dv.add(f"A{p_first}:A{m_last}")

ws.cell(row=p_first, column=7).comment = Comment(
    "Two games are the same game when they share a date, a score, and three of the four players - "
    "so the only difference is who is in the fourth seat. One pickleball game cannot be played twice "
    "like that, so the two names in that seat are one person. This is the only test here that proves "
    "anything, and it works regardless of what the two names look like.",
    "MIP Stat Room", width=420, height=130,
)
ws.cell(row=p_first, column=8).comment = Comment(
    "The disqualifier. If two names have ever been on court in the same game, they are two people, "
    "whatever else the evidence says. No row on this sheet has a YES - those pairs are on the "
    "'Already ruled out' tab.",
    "MIP Stat Room", width=400, height=90,
)

# Live tallies, so progress is visible in the file itself.
tally = m_last + 2
for i, (label, formula) in enumerate([
    ("Marked MERGE", f'=COUNTIF(A{p_first}:A{m_last},"MERGE")'),
    ("Marked KEEP SEPARATE", f'=COUNTIF(A{p_first}:A{m_last},"KEEP SEPARATE")'),
    # COUNTBLANK, not a subtraction from the row span: the two banner rows sit
    # inside the range and sits inside the range and would be counted as an unanswered pair.
    ("Still blank", f'=COUNTBLANK(A{p_first}:A{m_last})-1'),
    ("Duplicate games those merges would remove", f'=SUMIF(A{p_first}:A{m_last},"MERGE",G{p_first}:G{m_last})'),
]):
    ws.cell(row=tally + i, column=2, value=label).font = Font(name=ARIAL, size=10, bold=True)
    c = ws.cell(row=tally + i, column=1, value=formula)
    c.font = Font(name=ARIAL, size=10, bold=True, color=COURT)

# ================================================================ ruled out
rf = wb.create_sheet("Already ruled out")
title(
    rf,
    "Pairs that look like duplicates but are not",
    "Each of these has played in the same game as the other, which settles it - one person cannot be "
    "both sides of a serve. Listed so the question does not get asked a second time. Nothing to fill in.",
)
rf.merge_cells("A2:F2")
rf.row_dimensions[2].height = 34
head(rf, 4, ["Player", "Games", "Not the same as", "Games", "How the names relate", "Why we know"],
     [24, 8, 24, 8, 32, 52])
rf.freeze_panes = "A5"
r = 5
for x in SWEEP["ruledOut"]:
    rf.cell(row=r, column=1, value=x["keepName"])
    rf.cell(row=r, column=2, value=x["keepGames"])
    rf.cell(row=r, column=3, value=x["foldName"])
    rf.cell(row=r, column=4, value=x["foldGames"])
    rf.cell(row=r, column=5, value=x["nameSignal"])
    rf.cell(row=r, column=6, value="They have played in the same game, so they are two people.")
    for col in range(1, 7):
        rf.cell(row=r, column=col).font = Font(name=ARIAL, size=10)
        rf.cell(row=r, column=col).border = BOX
        rf.cell(row=r, column=col).alignment = Alignment(vertical="top", wrap_text=(col in (5, 6)))
    rf.cell(row=r, column=1).fill = RULED
    r += 1

# ============================================================ already merged
am = wb.create_sheet("Already merged")
title(
    am,
    "Merges already applied to the site",
    "These are live. Each was confirmed before it was applied, and the reasoning is recorded in "
    "importer/aliases.json. Listed here so the history is in one place.",
)
am.merge_cells("A2:C2")
head(am, 4, ["This name was folded in", "Into this one", "When and why"], [28, 28, 90])
am.freeze_panes = "A5"
notes = {
    "sal-farruggia-li-kick": "Jay, 2026-09-12. The league files listed Sal twice, under two clubs.",
    "brett-ritholt": "Jay, 2026-09-14. Three Brett rows, one man. Never on court together; on 2026-04-28 the two records play consecutive time blocks in the same tournament.",
    "brett": "Jay, 2026-09-14. Same merge - the eagle-emoji handle.",
    "vinz-viz": "2026-09-14. 62 of 77 games are the same game recorded twice, once from Scoreholio and once from DUPR.",
    "tommy-mcdonough": "2026-09-14. All 31 of Tommy's games are twins of Tom's. Tom is the spelling in Dave's Thursday workbook.",
    "rudolph": "2026-09-14. 136 twin games. 'Rudolph' was a first name with no surname.",
    "peter-delucia": "2026-09-14. All 12 games are twins, on one night. The name reads like a father and son; the games say otherwise.",
    "jeffrey-fein": "Jay, 2026-09-14. WEAKER EVIDENCE: no twin games at all. One record stops 2025-09-05 and the other starts 2025-10-03, which is what a renamed account looks like.",
}
r = 5
for k, v in ALIASES["mergedPlayers"].items():
    if k.startswith("_"):
        continue
    am.cell(row=r, column=1, value=k)
    am.cell(row=r, column=2, value=v)
    am.cell(row=r, column=3, value=notes.get(k, ""))
    for col in range(1, 4):
        am.cell(row=r, column=col).font = Font(name=ARIAL, size=10)
        am.cell(row=r, column=col).border = BOX
        am.cell(row=r, column=col).alignment = Alignment(vertical="top", wrap_text=(col == 3))
    am.row_dimensions[r].height = 30
    r += 1

# =================================================================== method
mt = wb.create_sheet("How this was worked out")
mt["A1"] = "How a duplicate is found, and what each test is worth"
mt["A1"].font = Font(name=ARIAL, size=15, bold=True, color=INK)
mt.column_dimensions["A"].width = 118
lines = [
    ("", ""),
    ("The test that proves it: twin games", "h"),
    ("Two games are TWINS when they share a date, a score, and three of the four players - so the only "
     "difference is who sat in the fourth seat. One pickleball game cannot be played twice that way. Either "
     "the two names in that seat are one person written down twice, or the data is broken.", "b"),
    ("This works without looking at the names at all, which is the point. It found that 'Vinz Viz' is Vincent "
     "Vizcarra, which no spelling test would catch. It also saw through 'Peter DeLucia' against 'Peter DeLucia "
     "Jr' - that reads exactly like a father and a son, and all 12 of their games turned out to be the same 12 "
     "games on one night.", "b"),
    ("", ""),
    ("The test that disqualifies: same court", "h"),
    ("If two names have ever been on court together in one game, they are two people. Nothing else matters "
     "after that. 49 pairs on this list were killed by it, including Matt and Steve Belanger and the two "
     "Rizzis - see the 'Already ruled out' tab.", "b"),
    ("", ""),
    ("The test that only suggests: how the names read", "h"),
    ("Tim against Timothy, Chris against Christopher, a bare first name against a full one. This is how a "
     "person notices a duplicate, and it is how most of the rows below the proven block got here - but on its "
     "own it proves nothing. This club has four Wangs, three Storks and three Millers, and they are families, "
     "not duplicates. Those rows are marked 'Likely family'.", "b"),
    ("", ""),
    ("Why most of the sheet is left to you", "h"),
    ("Where two records never overlap in time - one stops, the other starts - the games cannot tell a renamed "
     "account from two different people who simply played in different years. Jeff Fein was this shape and was "
     "merged on your say-so, not on the arithmetic.", "b"),
    ("", ""),
    ("What this sweep CANNOT find", "h"),
    ("A player who changed to a completely unrelated name between two eras, with no overlapping night, is "
     "invisible here - no twin games to catch them and no name to notice. A rename DURING an active period "
     "always leaves twin games, which is why the ones above were catchable. Worth knowing the gap exists "
     "rather than assuming the list is complete.", "b"),
    ("", ""),
    ("An earlier version of this sweep was wrong, and how", "h"),
    ("It first measured how much two players' circles of opponents overlap, and raised anything above 85%. "
     "That produced 1,424 pairs, headed by 'Skyler Shulman might be Mikel Strauch'. The flaw: Edward Rizzi has "
     "played 400-odd of the club's 537 people, so ANY twenty-contact player shows most of their circle inside "
     "his, purely by arithmetic. The figure now used is the overlap against what chance alone would give.", "b"),
    ("", ""),
    (f"Swept {SWEEP['totals']['games']:,} games and {SWEEP['totals']['players']} players on "
     f"{date.today().isoformat()}.", "b"),
]
r = 3
for text, kind in lines:
    c = mt.cell(row=r, column=1, value=text)
    if kind == "h":
        c.font = Font(name=ARIAL, size=11, bold=True, color=COURT)
    else:
        c.font = Font(name=ARIAL, size=10, color=INK)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if text:
            mt.row_dimensions[r].height = 14 * (len(text) // 118 + 2)
    r += 1

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(f"wrote {OUT}")
print(f"  proven      {len(proven)}")
print(f"  your call   {len(maybe)}")
print(f"  ruled out   {len(SWEEP['ruledOut'])}")
