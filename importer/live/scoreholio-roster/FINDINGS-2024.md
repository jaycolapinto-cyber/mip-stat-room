# 2024 names — read this before trusting `names-2024-new.tsv`

183 display→real-name pairs that appear in 2024 rosters and not in 2025, from
all 238 tournaments. Useful as a reference. **Not safe as a flat lookup table**,
for four separate reasons, each of which would corrupt a player's record.

## 1. The same handle is different people in different years

    Chris P.  =  Chris Pellicano   (2024)
    Chris P.  =  Chris Paolina     (2025)

Same as `Michael S.` being Spezio on one night and Scancarello on another. The
tournament is the unit of resolution; the handle is not.

## 2. The same handle is different people in the SAME year

    Rex B.    =  Rex Bunt     AND  Rex Burn
    Tara B.   =  Tara Bernstein AND Tara Burstein
    Steve D.  =  Steve Donnelly AND Steve Dougherty
    David J.  =  David Jacobs AND David Jackobs

Some of these are two people. Some are one person whose name was typed twice,
differently — "Bunt/Burn", "Bernstein/Burstein", "Jacobs/Jackobs" look like
typos; "Donnelly/Dougherty" look like two men. **Which is which cannot be
decided from this file**, and guessing either way is how one player inherits
another's record.

Note also `Michael D. = Michael DiTucci`, `Mike D. = Mike Dougherty`,
`Mikke D. = Mikke Dougherty`, `Michael  D. = Michael  Dougherty` — at least two
people and at least one misspelling, tangled together.

## 3. Placeholder rows

`Aaa B. → Aaa Bbb`, `Ccc D. → Ccc Ddd`, `Player 1 P. → Player 1 Player` and the
rest of that series are Scoreholio's filler for unregistered seats, not people.
They must never become roster entries.

## 4. Whitespace variants

`Ariel  C.` and `Ariel C.`, `Joshua  L.` and `Joshua L.`, `joseph F.` /
`joseph f.` / `joseph. f.` — the same person entered several ways. Harmless once
normalised, but it inflates any naive count.

## What is trustworthy here

The single-valued, non-placeholder rows — the large majority — and in
particular these, which resolve handles this project has puzzled over:

    Frank Footer              -> John Franzitta
    Dirty stay out            -> David Huber
    Daniel LaRusso (aka J.Z.) -> Jimmy Zervas
    🇺🇸 WJS 🇺🇸 / 🔥SCADUTES 🔥  -> Billy Scaduto
    Laurie🌸                  -> Laurie Mayer
    Craig Erk                 -> Craig Erkus
    Timothy L.                -> Timothy Lynch

## Status

There are no 2024 GAMES in the site yet — only these names. The match logs live
behind Scoreholio's tournament Admin screen, which is the live control panel for
a tournament (Advance Game, Pause, Edit, Clone) and was not entered without
Jay's explicit say-so.

The per-tournament 2024 rosters remain in the browser's local storage under the
key `mipRoster` (520 tournaments). If 2024 games are ever imported, re-extract
them per tournament rather than using this flattened file.
