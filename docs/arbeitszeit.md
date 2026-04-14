# Arbeitszeit

Overview
- Purpose: documents how Arbeitszeit is calculated in the app today.
- Scope: current live runtime.
- Important distinction:
  - `Automatischer Arbeitszeit-Vorschlag` is a UI helper that suggests labor hours from selected tasks and products.
  - pricing uses the values stored in `payload.Arbeitszeit`, especially the derived numeric hour fields and travel data.

Files
- `src/public/script.js`
- `src/logic/pricing.js`

## 1. Automatic labor suggestion

Main function
- `computeArbeitszeitSuggestion()` in `src/public/script.js`

What it does
- Builds a list of labor rows from the currently selected work items.
- Stores the result on `window.__arbeitszeitSuggestion`.
- Returns:
  - `rows`
  - `totalMinutes`
  - `totalHoursHHMM`
  - `totalHoursNumeric`

Base rules
- `remove_tub`: `45 min`
- `remove_showertub`: `30 min`
- `remove_enclosure`: `25 min`
- `install_tray`: `75 min`
- `install_enclosure`: `60 min`
- `install_bathtub_screen`: `60 min`
- `replace_shower_system`: `20 min`
- `relocate_faucet`: `90 min`
- `close_valve`: `45 min`
- `relocate_drain`: `30 min`
- `remove_toilet`: `50 min`
- `remove_sink`: `30 min`
- `install_toilet`: `20 min`

Additional suggestion rules
- `Wandverkleidung 997×2550`: `30 min` per entered panel quantity
- `Wandverkleidung 1497×2550`: `40 min` per entered panel quantity
- `Silikon`: `10 min`
- `Fußboden individuell`:
  - if `floorArea > 0`: `8 min` per m²
  - otherwise fallback: `25 min`
- Optional grab bars:
  - `CLPESG30`, `CLPESG40`, `CLPESG60`, `CLPESG80`
  - `30 min` per selected quantity

Quantity behavior
- For many checkbox-driven items, quantity defaults to at least `1`.
- Wall panel quantities come from:
  - `wvQty997`
  - `wvQty1497`
- Floor quantity comes from:
  - `floorArea`
- Grab-bar quantities come from:
  - matching `qty_*` inputs

Rendering
- `renderArbeitszeitSuggestion()` shows the rows in the suggestion table.
- Each row duration is:
  - `row.minutes * row.qty`
- The footer total is the sum of all row durations.

Apply behavior
- `applyArbeitszeitSuggestion()` copies the suggested total into `#laborHours`
- It also sets:
  - `window.labor_hours_source = "auto"`
- If the user edits `#laborHours` manually afterward, the source switches back to:
  - `window.labor_hours_source = "manual"`

## 2. Manual labor and travel inputs

Relevant inputs
- `laborHours`
- `travelTime`
- `distanceKm`
- `uebernachten`
- `travelSecondWorkerRate`

Helpers
- `laborHours` and `travelTime` are stored as `HH:MM`
- `updateTotalHours()` converts those values into numeric hours

## 3. Total-hours calculation

Main function
- `updateTotalHours()` in `src/public/script.js`

Inputs
- `arbeitsH` = `laborHours` converted from `HH:MM` to decimal hours
- `reiseOneH` = `travelTime` converted from `HH:MM` to decimal hours

Daily cap
- The code uses:
  - `capPerDayH = 9.75 - 2 * reiseOneH`
- This means:
  - one workday is capped at `9.75 h` total
  - the round-trip travel time for that day is subtracted first
  - the rest is available for actual work

Workday calculation
- If `arbeitsH <= 0`:
  - `days = 0`
  - `totalH = 0`
- If `capPerDayH > 0`:
  - `days = ceil(arbeitsH / capPerDayH)`
  - `totalH = arbeitsH + days * (2 * reiseOneH)`
- Otherwise:
  - the combination is marked infeasible
  - no valid work time remains after travel

Derived runtime values
- `window.total_hours_numeric`
  - total time including work and all travel days
- `window.reise_hours_numeric`
  - total travel time across all work days
- `window.arbeit_hours_numeric`
  - pure work time only
- `window.arbeitstage_numeric`
  - number of work days
- `window.uebernachten_numeric`
  - clamped to at most `days - 1`
- `window.travel_days_numeric`
  - `days - overnights`

UI output
- `#totalHoursHHMM` shows:
  - total time
  - number of workdays
  - infeasibility warning if travel consumes too much of the day

## 4. How pricing uses Arbeitszeit

Main function
- `computeServiceCosts(payload)` in `src/logic/pricing.js`

Inputs read from payload
- `payload.Arbeitszeit.workDays`
- `payload.Arbeitszeit.travelDays`
- `payload.Arbeitszeit.distanceKm`
- `payload.Arbeitszeit.totalHoursNumeric`
- `payload.Arbeitszeit.totalHoursHHMM`
- `payload.Arbeitszeit.ReiseHoursNumeric`
- `payload.Arbeitszeit.ArbeitHoursNumeric`
- `payload.Arbeitszeit.travelSecondWorkerRate`

Payer-dependent labor rate
- `Kassenkunde`: `69.5 €/h`
- `Selbstzahler`: `59.5 €/h`

Fixed service components
- `Fahrzeugbereitstellung`: `80.00 €` per work day
- `Bereitstellung und Vorhaltung von Maschinen & Werkzeugen`: `7.50 €` per work day
- `Beräumung der Baustelle`: `4.50 €` per work day
- `Kilometerpauschale`: `0.35 €` per km

Travel distance
- `distanceKm` is treated as one-way km
- pricing converts it to:
  - `roundTripKm = oneWayKm * 2 * travelDays`

Second worker travel rate
- raw input is read from:
  - `travelSecondWorkerRate`
- allowed effective values are normalized to:
  - `35 €/h` if explicitly set to `35`
  - otherwise `25 €/h`

Facharbeiter formula
- `handwerkerCount = 2`
- `facharbeiter =`
  - `ArbeitHoursNumeric * 2 * laborRate`
  - `+ ReiseHoursNumeric * (laborRate + secondWorkerTravelRate)`

Meaning
- pure labor hours are billed with two workers at the full payer rate
- travel hours are billed as:
  - driver at full labor rate
  - second worker at `25` or `35 €/h`

Generated service lines
- vehicle setup
- tools/machines
- site clearing
- kilometer allowance
- Facharbeiter line

Notes
- The Facharbeiter line is marked `docxHide: true`
- work-note lines from `computeWorkNotes(payload)` are then appended afterward

## 5. What gets stored in the payload

From the live page, the payload stores:
- `uebernachten`
- `workDays`
- `travelDays`
- `laborHoursHHMM`
- `travelTimeHHMM`
- `distanceKm`
- `travelSecondWorkerRate`
- `laborHoursSource`
- `totalHoursHHMM`
- `totalHoursNumeric`
- `ReiseHoursNumeric`
- `ArbeitHoursNumeric`

That payload is what pricing later consumes.

## 6. Important practical behavior

- The automatic suggestion does not directly change pricing until its result is applied into `laborHours`.
- Pricing depends on the final Arbeitszeit payload values, not just on the suggestion rows.
- Floor labor now scales with entered floor area.
- Wall labor now scales with entered wall panel quantities.
- If travel time is too high relative to the daily cap, the UI warns the user.
- Overnight stays reduce the number of travel days used for some downstream calculations, but they are clamped so they cannot exceed `workDays - 1`.

## 7. Safe interpretation

Today the app uses this flow:
1. UI selections create an automatic labor suggestion.
2. That suggestion can be copied into `laborHours`.
3. `laborHours` and `travelTime` are converted into numeric totals.
4. Those totals are saved into `payload.Arbeitszeit`.
5. Pricing reads the saved Arbeitszeit payload and calculates service costs from it.
