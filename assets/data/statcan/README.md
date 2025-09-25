StatCan masterdata directory
================================

Put curated Statistics Canada extracts here for the dashboard to load directly (no network dependency).

Recommended structure
---------------------

- census_2021/
  - muslim_timeseries.json            # National time series for Muslim population (2001–2021)
  - provinces_muslim_population.json  # By-province counts/percentages (optional)
- census_2016/                        # Older census snapshots (optional)
- reference/
  - geographies.csv                   # DGUID / PR codes, names (optional)
  - variables.csv                     # Variable mapping/notes (optional)

File format guidelines
----------------------

- Use JSON for small/medium payloads the UI fetches directly. Use CSV for large tables.
- Prefer stable keys and include minimal metadata, e.g. `source`, `notes`, `lastUpdated`.

Example: muslim_timeseries.json
--------------------------------

{
  "years": ["2001", "2006", "2011", "2016", "2021"],
  "counts": [579640, 783700, 1053945, 1420300, 1775710],
  "source": "Statistics Canada, Census of Population, 2001-2021",
  "notes": "Population self-identified as Muslim (Religion)"
}

How the app loads data
----------------------

- `index.html` fetches `assets/data/statcan/census_2021/muslim_timeseries.json` on load to populate KPIs and the growth chart.
- If you replace that file with an authoritative extract, the dashboard will reflect it on next load.


PUMF ingestion in Data Explorer (insights.html)
------------------------------------------------

The Data Explorer supports client-side ingestion of StatCan PUMF microdata (CSV/XLSX). After loading a file, you can pick two categorical variables and an optional weight variable to generate a weighted cross-tab chart and table.

Supported formats
-----------------

- CSV: Header row required; mixed types are auto-parsed.
- XLSX/XLS: First worksheet is read; empty cells become null.
- SAV: Not supported in-browser. Convert to CSV/XLSX using R or Python (see below).

Recommended weight field names (auto-detected if present)
---------------------------------------------------------

`WGHT_PER`, `WTS_P`, `WTS`, `WEIGHT`, `WGHT`, `WT`, `WTP`, `W_F`, `FINALWGT`, `PUMFIDWT`

Converting SAV to CSV/XLSX
--------------------------

- R (haven):
  - `install.packages('haven')`
  - `library(haven); df <- read_sav('input.sav'); write.csv(df, 'output.csv', row.names=FALSE)`

- Python (pyreadstat/pandas):
  - `pip install pyreadstat pandas`
  - `import pyreadstat, pandas as pd; df, meta = pyreadstat.read_sav('input.sav'); df.to_csv('output.csv', index=False)`

StatCan licence and attribution
-------------------------------

When using StatCan data, include attribution such as:

"Contains information licensed under the Statistics Canada Open Licence. Statistics Canada, Census of Population, various years."


