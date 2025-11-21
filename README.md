# TooDoo

Simple Tkinter to-do list with hotkeys and projects.

## Features
- Short-term, long-term, and projects sections
- Hotkeys: `Alt+Shift+S` (add short) and `Alt+Shift+L` (add long)
- Double-click checkbox to remove with a quick fade
- Edit tasks in place; adjust font size
- Move tasks between short/long with the ⇄ button
- Projects support multiple notes inside a task, each deletable

## Run
```bash
# EITHER set env directly
set SQLITECLOUD_URL=sqlitecloud://<host>:<port>/<db>?apikey=<your_key>

# OR create a .env file (ignored by git) based on .env.example:
# SQLITECLOUD_URL=sqlitecloud://<host>:<port>/<db>?apikey=<your_key>
python toodoo.py
```

## Notes
- Data lives in SQLiteCloud (set `SQLITECLOUD_URL` env var). A `.env` file is ignored by git.
- Dependencies: see `requirements.txt` (`tkinter` is bundled with Python on most platforms).
