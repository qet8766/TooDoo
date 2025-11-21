from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Tuple

import sqlitecloud


TaskData = Dict[str, str | list]


class TaskRepository:
    """Encapsulates all SQLiteCloud I/O for tasks, project items, and settings."""

    def __init__(self, db_url: str):
        if not db_url:
            raise RuntimeError("SQLITECLOUD_URL environment variable is required")

        self.conn = sqlitecloud.connect(db_url)
        self._init_db()

    def load_state(self) -> Tuple[Dict[str, List[TaskData]], int | None]:
        tasks: Dict[str, List[TaskData]] = {"short_term": [], "long_term": [], "projects": []}
        cur = self.conn.cursor()
        cur.execute("SELECT id, name, description, section, created FROM tasks ORDER BY created DESC")
        for row in cur.fetchall():
            section = row[3]
            task: TaskData = {
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "created": row[4],
                "section": section,
            }
            if section == "projects":
                task["items"] = []
            tasks.setdefault(section, []).append(task)

        items_by_task: Dict[str, List[TaskData]] = {}
        cur.execute("SELECT id, task_id, text FROM project_items")
        for item_id, task_id, text in cur.fetchall():
            items_by_task.setdefault(task_id, []).append({"id": item_id, "text": text})
        for project in tasks.get("projects", []):
            project["items"] = items_by_task.get(project["id"], [])

        cur.execute("SELECT value FROM settings WHERE key='font_size'")
        row = cur.fetchone()
        font_size = None
        if row:
            try:
                font_size = int(row[0])
            except ValueError:
                font_size = None

        return tasks, font_size

    def insert_task(self, task: TaskData) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO tasks (id, name, description, section, created) VALUES (?, ?, ?, ?, ?)",
            (
                task["id"],
                task["name"],
                task.get("description", ""),
                task.get("section", "short_term"),
                task.get("created", datetime.now().isoformat()),
            ),
        )
        self.conn.commit()

    def update_task(self, task: TaskData) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE tasks SET name = ?, description = ? WHERE id = ?",
            (task["name"], task.get("description", ""), task["id"]),
        )
        self.conn.commit()

    def update_task_section(self, task_id: str, section: str) -> None:
        cur = self.conn.cursor()
        cur.execute("UPDATE tasks SET section = ? WHERE id = ?", (section, task_id))
        self.conn.commit()

    def delete_task(self, task_id: str) -> None:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM project_items WHERE task_id = ?", (task_id,))
        cur.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self.conn.commit()

    def insert_project_item(self, task_id: str, item: TaskData) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO project_items (id, task_id, text) VALUES (?, ?, ?)",
            (item["id"], task_id, item["text"]),
        )
        self.conn.commit()

    def delete_project_item(self, item_id: str) -> None:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM project_items WHERE id = ?", (item_id,))
        self.conn.commit()

    def save_font_size(self, font_size: int) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO settings (key, value) VALUES ('font_size', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (str(font_size),),
        )
        self.conn.commit()

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            # Do not propagate close errors on shutdown.
            pass

    def _init_db(self) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                section TEXT NOT NULL,
                created TEXT
            )
        """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS project_items (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                text TEXT NOT NULL
            )
        """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """
        )
        self.conn.commit()
