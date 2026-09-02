# URL parameters

The application's entry state is addressable. Two parameters, both optional.

## `?mode=` — which view opens

| value | opens |
|---|---|
| `eng`, `engineering` | Engineering (the default when the parameter is absent or unrecognised) |
| `comm`, `commercial` | Commercial |
| `revisit` | REVISIT |

Short and long spellings are equivalent, case-insensitive, and surrounding
whitespace is ignored. The short forms are what a person types into a link they
are about to send; the long forms are what the application writes back into the
URL whenever the mode changes, and what the existing specs and documents use.
Both keep working, so no bookmark or link ever breaks.

## `?standalone=1` — this deployment is one mode

Accepted values: `1` or `true`. Anything else — absent, empty, `0`, `yes` — means
the normal application, where every mode reaches every other. A typo cannot
silently lock an interface.

It composes with any `mode`:

```
/?mode=revisit&standalone=1     REVISIT, with no way out from inside
/?mode=comm&standalone=1        Commercial, with no Engineering and no REVISIT
/?mode=eng&standalone=1         Engineering alone
```

What it removes, everywhere it appears:

- the **ENG/COMM/Revisit switch** in the telecom header — one component,
  `AppModeSwitch`, rendered at four call sites (desktop header, compact header
  and two HUD variants). It is withheld at the single place they all come from,
  so a standalone deployment cannot keep the switch in one placement by
  accident;
- the **back-to-ENG/COMM control** in the REVISIT header rail. The `?` help
  button then takes the whole rail height instead of the 32 px strip above that
  control;
- the **exit button on both crash boundaries** (`Switch to REVISIT` in telecom,
  `Back to telecom analysis` in REVISIT). An interface that unlocks itself when
  something throws is not locked, and a crash is exactly when someone would
  reach for the escape hatch.

### How it is implemented, and why there

The flag is applied in `RootShell` by **withholding the callbacks that change
modes** — `onExit`, `onSwitchToRevisit`, `modeSwitchingAvailable` — rather than
by each view testing a flag. A view cannot offer a switch it was never given,
which is what stops the lock from having to be re-implemented, and re-remembered,
in every surface that happens to have an exit.

It is read **once, at mount**, and held in a ref. It describes the link the
session was opened with, not a state the session can enter: a `popstate`
carrying a URL without the parameter must not unlock an interface that opened
locked, or Back becomes the escape hatch the flag exists to remove.

### What it is not

**Not a security control.** The URL stays editable and all three modes are in
one bundle — the flag removes the affordances, it does not sandbox anything. A
deployment that must not be able to reach the other modes at all needs a
separate build, not a query parameter.

### Covered by

- `src/hooks/__tests__/useAppModeState.test.tsx` — parsing, the aliases, and
  that a `popstate` cannot clear the flag.
- `e2e/standalone-mode.spec.ts` — the switch absent in ENG and COMM, the return
  control absent in REVISIT and the `?` spanning the rail, and the paired
  negative cases without the flag.
- `src/components/errors/__tests__/errorBoundaryExit.test.tsx` — a crash
  boundary given no destination renders no exit button.
