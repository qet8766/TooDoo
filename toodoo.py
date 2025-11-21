import tkinter as tk
from tkinter import ttk, font
import os
from pathlib import Path
from datetime import datetime
from pynput import keyboard
import threading
import time
import sqlitecloud

class TooDoo:
    def __init__(self):
        self.load_env_file()
        self.root = tk.Tk()
        self.root.title("TooDoo")
        self.root.geometry("500x600")
        self.root.configure(bg="#1E1E1E")  # Dark background
        
        # Always on top
        self.root.attributes('-topmost', True)
        
        # Make window resizable
        self.root.minsize(400, 400)
        
        # Cloud DB connection
        self.db_url = os.environ.get("SQLITECLOUD_URL")
        if not self.db_url:
            raise RuntimeError("SQLITECLOUD_URL environment variable is required")
        self.conn = sqlitecloud.connect(self.db_url)
        self.init_db()
        
        # Font size (default)
        self.font_size = 10
        
        # Tasks storage
        self.tasks = {"short_term": [], "long_term": [], "projects": []}
        
        # Load existing data
        self.load_data()
        
        # Track checkbox clicks for double-click detection
        self.checkbox_clicks = {}
        
        # Setup UI
        self.setup_ui()
        
        # Start global hotkey listener
        self.start_hotkey_listener()
        
        # Bind close event to save
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
    def setup_ui(self):
        # Top bar with font size controls
        top_frame = tk.Frame(self.root, bg="#2D2D30")
        top_frame.pack(fill=tk.X, padx=10, pady=5)
        
        tk.Label(top_frame, text="Font Size:", bg="#2D2D30", fg="#CCCCCC").pack(side=tk.LEFT)
        
        btn_decrease = tk.Button(top_frame, text="-", command=lambda: self.change_font_size(-1),
                                bg="#3E3E42", fg="#CCCCCC", relief=tk.FLAT, width=3)
        btn_decrease.pack(side=tk.LEFT, padx=2)
        
        self.font_label = tk.Label(top_frame, text=str(self.font_size), bg="#2D2D30", fg="#CCCCCC", width=3)
        self.font_label.pack(side=tk.LEFT)
        
        btn_increase = tk.Button(top_frame, text="+", command=lambda: self.change_font_size(1),
                                bg="#3E3E42", fg="#CCCCCC", relief=tk.FLAT, width=3)
        btn_increase.pack(side=tk.LEFT, padx=2)
        
        # Hotkey info
        info_text = "Hotkeys: Alt+Shift+S (Short) | Alt+Shift+L (Long)"
        tk.Label(top_frame, text=info_text, bg="#2D2D30", fg="#808080", font=("Arial", 8)).pack(side=tk.RIGHT)
        
        # Main container with canvas for scrolling
        main_container = tk.Frame(self.root, bg="#1E1E1E")
        main_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        # Canvas and scrollbar
        self.canvas = tk.Canvas(main_container, bg="#1E1E1E", highlightthickness=0)
        scrollbar = ttk.Scrollbar(main_container, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas, bg="#1E1E1E")
        
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        
        # Create canvas window and store its ID
        self.canvas_window = self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)
        
        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Enable mousewheel scrolling
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)
        
        # Update canvas width on window resize
        self.canvas.bind("<Configure>", self._on_canvas_resize)
        
        # Create sections
        self.create_section_ui()
        
    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-1*(event.delta/120)), "units")
    
    def _on_canvas_resize(self, event):
        # Update canvas window width to match canvas width immediately
        self.canvas.itemconfig(self.canvas_window, width=event.width)
        
    def create_section_ui(self):
        # Clear existing widgets
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        
        # Short term section
        self.create_section("Short Term", "short_term", "#1E3A5F")
        
        # Separator
        separator = tk.Frame(self.scrollable_frame, height=2, bg="#3E3E42")
        separator.pack(fill=tk.X, pady=15)
        
        # Long term section
        self.create_section("Long Term", "long_term", "#1E4D2B")
        
        # Separator
        separator2 = tk.Frame(self.scrollable_frame, height=2, bg="#3E3E42")
        separator2.pack(fill=tk.X, pady=15)
        
        # Projects section
        self.create_section("Projects", "projects", "#5A2D2D")
        
    def create_section(self, title, section_key, color):
        section_frame = tk.Frame(self.scrollable_frame, bg="#1E1E1E")
        section_frame.pack(fill=tk.BOTH, padx=5, pady=5)
        
        # Section header with add button
        header_frame = tk.Frame(section_frame, bg=color)
        header_frame.pack(fill=tk.X)
        
        header = tk.Label(header_frame, text=title, bg=color, fg="#E0E0E0",
                         font=("Arial", 12, "bold"), anchor="w", padx=10, pady=8)
        header.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        add_command = self.add_task if section_key != "projects" else self.add_project_task
        add_btn = tk.Button(header_frame, text="+", command=lambda sk=section_key: add_command(sk),
                           bg="#3E3E42", fg="#FFFFFF", relief=tk.FLAT, width=3, height=1,
                           font=("Arial", 11, "bold"), cursor="hand2", activebackground="#4E4E52")
        add_btn.pack(side=tk.RIGHT, padx=8, pady=8)
        
        # Tasks container
        tasks_container = tk.Frame(section_frame, bg="#1E1E1E")
        tasks_container.pack(fill=tk.BOTH, padx=5, pady=5)
        
        # Display tasks (newest first)
        for task in self.tasks[section_key]:
            self.create_task_widget(tasks_container, task, section_key)
            
    def create_task_widget(self, parent, task, section_key):
        task_frame = tk.Frame(parent, bg="#3A3A3D", relief=tk.FLAT, borderwidth=1, highlightthickness=1, highlightbackground="#4A4A4D")
        task_frame.pack(fill=tk.X, pady=3)
        task_frame.task_id = task['id']  # Store task ID for reference
        
        # Left controls row (checkbox + edit + move)
        controls = tk.Frame(task_frame, bg="#3A3A3D")
        controls.pack(side=tk.LEFT, padx=10, pady=6)
        
        checkbox = tk.Canvas(controls, width=18, height=18, bg="#1E1E1E", highlightthickness=1,
                           highlightbackground="#5A5A5A", cursor="hand2")
        checkbox.pack(side=tk.LEFT, padx=(0, 6))
        checkbox.bind("<Button-1>", lambda e, tid=task['id'], sf=section_key, tf=task_frame: 
                     self.on_checkbox_click(tid, sf, tf))
        
        edit_btn = tk.Button(controls, text="✎", command=lambda: self.edit_task(task, section_key),
                           bg="#4A4A4D", fg="#CCCCCC", relief=tk.FLAT, width=2, height=1,
                           font=("Arial", 10), cursor="hand2", activebackground="#5A5A5D")
        edit_btn.pack(side=tk.LEFT, padx=(0, 6))
        
        if section_key in ("short_term", "long_term"):
            move_btn = tk.Button(controls, text="⇄", command=lambda: self.move_task(task, section_key),
                               bg="#4A4A4D", fg="#CCCCCC", relief=tk.FLAT, width=2, height=1,
                               font=("Arial", 10), cursor="hand2", activebackground="#5A5A5D")
            move_btn.pack(side=tk.LEFT)
        
        # Right side - task content (expands to fill width)
        content_frame = tk.Frame(task_frame, bg="#3A3A3D")
        content_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        
        task_name = tk.Label(content_frame, text=task['name'], bg="#3A3A3D", fg="#E0E0E0",
                           font=("Arial", self.font_size, "bold"), anchor="w", justify=tk.LEFT, wraplength=400)
        task_name.pack(fill=tk.X)
        
        task_desc = None
        if task['description']:
            task_desc = tk.Label(content_frame, text=task['description'], bg="#3A3A3D", fg="#A0A0A0",
                               font=("Arial", self.font_size-1), anchor="w", wraplength=400, justify=tk.LEFT)
            task_desc.pack(fill=tk.X, pady=(2, 0))
        
        # Projects: show multiple sub-items with delete controls
        if section_key == "projects":
            items_frame = tk.Frame(content_frame, bg="#3A3A3D")
            items_frame.pack(fill=tk.X, pady=(6, 0))
            for item in task.get('items', []):
                row = tk.Frame(items_frame, bg="#323234")
                row.pack(fill=tk.X, pady=2)
                label = tk.Label(row, text=item.get('text', ''), bg="#323234", fg="#CFCFCF",
                                font=("Arial", self.font_size-1), anchor="w", justify=tk.LEFT, wraplength=380)
                label.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6, pady=4)
                del_btn = tk.Button(row, text="✕", command=lambda iid=item['id'], tid=task['id']: self.delete_project_item(tid, iid),
                                   bg="#4A4A4D", fg="#CCCCCC", relief=tk.FLAT, width=2, height=1,
                                   font=("Arial", 9), cursor="hand2", activebackground="#5A5A5D")
                del_btn.pack(side=tk.RIGHT, padx=6)
            
            add_item_btn = tk.Button(content_frame, text="+ add note", command=lambda t=task: self.add_project_item(t),
                                   bg="#2D6A4F", fg="#FFFFFF", relief=tk.FLAT, width=12, height=1,
                                   font=("Arial", 9), cursor="hand2", activebackground="#3C7A5F")
            add_item_btn.pack(anchor="w", pady=(6, 0))
        
        # Bind to update wraplength when frame resizes
        def update_wraplength(event):
            available_width = content_frame.winfo_width() - 20
            if available_width > 100:
                task_name.configure(wraplength=available_width)
                if task_desc:
                    task_desc.configure(wraplength=available_width)
        
        content_frame.bind("<Configure>", update_wraplength)
        
    def on_checkbox_click(self, task_id, section_key, task_frame):
        current_time = time.time()
        
        if task_id in self.checkbox_clicks:
            last_click_time = self.checkbox_clicks[task_id]
            time_diff = current_time - last_click_time
            
            # Double-click detected (within 0.5 seconds)
            if time_diff <= 0.5:
                self.delete_task_with_fade(task_id, section_key, task_frame)
                del self.checkbox_clicks[task_id]
                return
        
        # First click or too slow
        self.checkbox_clicks[task_id] = current_time
        
    def delete_task_with_fade(self, task_id, section_key, task_frame):
        # Fast fade out animation
        def fade():
            alpha = 1.0
            for _ in range(5):  # 5 steps for fast fade
                alpha -= 0.2
                task_frame.configure(bg=f"#{int(255*alpha):02x}{int(255*alpha):02x}{int(255*alpha):02x}")
                task_frame.update()
                time.sleep(0.03)
            
            # Remove task from data
            self.tasks[section_key] = [t for t in self.tasks[section_key] if t['id'] != task_id]
            self.delete_task_db(task_id)
            self.create_section_ui()
        
        threading.Thread(target=fade, daemon=True).start()
        
    def add_task(self, section_key):
        dialog = tk.Toplevel(self.root)
        dialog.title("New Task")
        dialog.geometry("450x220")
        dialog.configure(bg="#2D2D30")
        dialog.attributes('-topmost', True)
        
        # Position dialog near main window
        main_x = self.root.winfo_x()
        main_y = self.root.winfo_y()
        dialog.geometry(f"+{main_x + 50}+{main_y + 50}")
        
        # Task name
        tk.Label(dialog, text="Task Name:", bg="#2D2D30", fg="#CCCCCC", font=("Arial", 10)).pack(pady=(15, 5))
        name_entry = tk.Entry(dialog, width=50, font=("Arial", 10), relief=tk.SOLID, borderwidth=1, 
                            bg="#1E1E1E", fg="#E0E0E0", insertbackground="#E0E0E0")
        name_entry.pack(pady=5, padx=20)
        name_entry.focus()
        
        # Description
        tk.Label(dialog, text="Description (optional):", bg="#2D2D30", fg="#CCCCCC", font=("Arial", 10)).pack(pady=(10, 5))
        desc_entry = tk.Entry(dialog, width=50, font=("Arial", 10), relief=tk.SOLID, borderwidth=1,
                            bg="#1E1E1E", fg="#E0E0E0", insertbackground="#E0E0E0")
        desc_entry.pack(pady=5, padx=20)
        
        def save_task():
            name = name_entry.get().strip()
            if name:
                task = {
                    'id': datetime.now().strftime("%Y%m%d%H%M%S%f"),
                    'name': name,
                    'description': desc_entry.get().strip(),
                    'created': datetime.now().isoformat(),
                    'section': section_key
                }
                # Insert at beginning (top)
                self.tasks[section_key].insert(0, task)
                self.insert_task_db(task)
                self.create_section_ui()
                dialog.destroy()
        
        # Buttons
        btn_frame = tk.Frame(dialog, bg="#2D2D30")
        btn_frame.pack(pady=15)
        
        tk.Button(btn_frame, text="Save", command=save_task, bg="#0D6EFD", fg="#FFFFFF",
                 relief=tk.FLAT, width=12, font=("Arial", 10), cursor="hand2", 
                 activebackground="#0B5ED7").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="Cancel", command=dialog.destroy, bg="#3E3E42", fg="#CCCCCC",
                 relief=tk.FLAT, width=12, font=("Arial", 10), cursor="hand2",
                 activebackground="#4E4E52").pack(side=tk.LEFT, padx=5)
        
        # Bind Enter key
        name_entry.bind("<Return>", lambda e: save_task())
        desc_entry.bind("<Return>", lambda e: save_task())
        
    def add_project_task(self, section_key="projects"):
        dialog = tk.Toplevel(self.root)
        dialog.title("New Project")
        dialog.geometry("450x220")
        dialog.configure(bg="#2D2D30")
        dialog.attributes('-topmost', True)
        
        main_x = self.root.winfo_x()
        main_y = self.root.winfo_y()
        dialog.geometry(f"+{main_x + 50}+{main_y + 50}")
        
        tk.Label(dialog, text="Project Name:", bg="#2D2D30", fg="#CCCCCC", font=("Arial", 10)).pack(pady=(15, 5))
        name_entry = tk.Entry(dialog, width=50, font=("Arial", 10), relief=tk.SOLID, borderwidth=1, 
                            bg="#1E1E1E", fg="#E0E0E0", insertbackground="#E0E0E0")
        name_entry.pack(pady=5, padx=20)
        name_entry.focus()
        
        tk.Label(dialog, text="Description (optional):", bg="#2D2D30", fg="#CCCCCC", font=("Arial", 10)).pack(pady=(10, 5))
        desc_entry = tk.Entry(dialog, width=50, font=("Arial", 10), relief=tk.SOLID, borderwidth=1,
                            bg="#1E1E1E", fg="#E0E0E0", insertbackground="#E0E0E0")
        desc_entry.pack(pady=5, padx=20)
        
        def save_project():
            name = name_entry.get().strip()
            if name:
                task = {
                    'id': datetime.now().strftime("%Y%m%d%H%M%S%f"),
                    'name': name,
                    'description': desc_entry.get().strip(),
                    'section': section_key,
                    'items': [],
                    'created': datetime.now().isoformat()
                }
                self.tasks[section_key].insert(0, task)
                self.insert_task_db(task)
                self.create_section_ui()
                dialog.destroy()
        
        btn_frame = tk.Frame(dialog, bg="#2D2D30")
        btn_frame.pack(pady=15)
        
        tk.Button(btn_frame, text="Save", command=save_project, bg="#0D6EFD", fg="#FFFFFF",
                 relief=tk.FLAT, width=12, font=("Arial", 10), cursor="hand2", 
                 activebackground="#0B5ED7").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="Cancel", command=dialog.destroy, bg="#3E3E42", fg="#CCCCCC",
                 relief=tk.FLAT, width=12, font=("Arial", 10), cursor="hand2",
                 activebackground="#4E4E52").pack(side=tk.LEFT, padx=5)
        
        name_entry.bind("<Return>", lambda e: save_project())
        desc_entry.bind("<Return>", lambda e: save_project())
        
    def edit_task(self, task, section_key):
        dialog = tk.Toplevel(self.root)
        dialog.title("Edit Task")
        dialog.geometry("450x220")
        dialog.configure(bg="#2D2D30")
        dialog.attributes('-topmost', True)
        
        # Position dialog near main window
        main_x = self.root.winfo_x()
        main_y = self.root.winfo_y()
        dialog.geometry(f"+{main_x + 50}+{main_y + 50}")
        
        # Task name
        tk.Label(dialog, text="Task Name:", bg="#2D2D30", fg="#CCCCCC", font=("Arial", 10)).pack(pady=(15, 5))
        name_entry = tk.Entry(dialog, width=50, font=("Arial", 10), relief=tk.SOLID, borderwidth=1,
                            bg="#1E1E1E", fg="#E0E0E0", insertbackground="#E0E0E0")
        name_entry.insert(0, task['name'])
        name_entry.pack(pady=5, padx=20)
        name_entry.focus()
        
        # Description
        tk.Label(dialog, text="Description (optional):", bg="#2D2D30", fg="#CCCCCC", font=("Arial", 10)).pack(pady=(10, 5))
        desc_entry = tk.Entry(dialog, width=50, font=("Arial", 10), relief=tk.SOLID, borderwidth=1,
                            bg="#1E1E1E", fg="#E0E0E0", insertbackground="#E0E0E0")
        desc_entry.insert(0, task['description'])
        desc_entry.pack(pady=5, padx=20)
        
        def save_changes():
            name = name_entry.get().strip()
            if name:
                task['name'] = name
                task['description'] = desc_entry.get().strip()
                self.update_task_db(task)
                self.create_section_ui()
                dialog.destroy()
        
        # Buttons
        btn_frame = tk.Frame(dialog, bg="#2D2D30")
        btn_frame.pack(pady=15)
        
        tk.Button(btn_frame, text="Save", command=save_changes, bg="#0D6EFD", fg="#FFFFFF",
                 relief=tk.FLAT, width=12, font=("Arial", 10), cursor="hand2",
                 activebackground="#0B5ED7").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="Cancel", command=dialog.destroy, bg="#3E3E42", fg="#CCCCCC",
                 relief=tk.FLAT, width=12, font=("Arial", 10), cursor="hand2",
                 activebackground="#4E4E52").pack(side=tk.LEFT, padx=5)
        
        name_entry.bind("<Return>", lambda e: save_changes())
        desc_entry.bind("<Return>", lambda e: save_changes())
    
    def add_project_item(self, task):
        dialog = tk.Toplevel(self.root)
        dialog.title("Add Note")
        dialog.geometry("400x160")
        dialog.configure(bg="#2D2D30")
        dialog.attributes('-topmost', True)
        
        main_x = self.root.winfo_x()
        main_y = self.root.winfo_y()
        dialog.geometry(f"+{main_x + 70}+{main_y + 70}")
        
        tk.Label(dialog, text="Note:", bg="#2D2D30", fg="#CCCCCC", font=("Arial", 10)).pack(pady=(15, 5))
        note_entry = tk.Entry(dialog, width=45, font=("Arial", 10), relief=tk.SOLID, borderwidth=1,
                            bg="#1E1E1E", fg="#E0E0E0", insertbackground="#E0E0E0")
        note_entry.pack(pady=5, padx=20)
        note_entry.focus()
        
        def save_note():
            text = note_entry.get().strip()
            if text:
                new_item = {
                    'id': datetime.now().strftime("%Y%m%d%H%M%S%f"),
                    'text': text
                }
                for proj in self.tasks.get("projects", []):
                    if proj['id'] == task['id']:
                        proj.setdefault('items', [])
                        proj['items'].append(new_item)
                        self.insert_project_item_db(task['id'], new_item)
                        break
                self.create_section_ui()
                dialog.destroy()
        
        btn_frame = tk.Frame(dialog, bg="#2D2D30")
        btn_frame.pack(pady=12)
        
        tk.Button(btn_frame, text="Save", command=save_note, bg="#0D6EFD", fg="#FFFFFF",
                 relief=tk.FLAT, width=10, font=("Arial", 10), cursor="hand2",
                 activebackground="#0B5ED7").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="Cancel", command=dialog.destroy, bg="#3E3E42", fg="#CCCCCC",
                 relief=tk.FLAT, width=10, font=("Arial", 10), cursor="hand2",
                 activebackground="#4E4E52").pack(side=tk.LEFT, padx=5)
        
        note_entry.bind("<Return>", lambda e: save_note())
        
    def delete_project_item(self, project_id, item_id):
        for proj in self.tasks.get("projects", []):
            if proj['id'] == project_id:
                proj['items'] = [item for item in proj.get('items', []) if item['id'] != item_id]
                break
        self.delete_project_item_db(item_id)
        self.create_section_ui()
        
    def move_task(self, task, current_section):
        if current_section not in ("short_term", "long_term"):
            return
        target_section = "long_term" if current_section == "short_term" else "short_term"
        self.tasks[current_section] = [t for t in self.tasks[current_section] if t['id'] != task['id']]
        task['section'] = target_section
        self.tasks[target_section].insert(0, task)
        self.update_task_section_db(task['id'], target_section)
        self.create_section_ui()
        
    def change_font_size(self, delta):
        self.font_size = max(8, min(20, self.font_size + delta))
        self.font_label.config(text=str(self.font_size))
        self.create_section_ui()
        self.save_font_size_db(self.font_size)
        
    def start_hotkey_listener(self):
        def on_hotkey_short():
            self.root.after(0, lambda: self.add_task("short_term"))
        
        def on_hotkey_long():
            self.root.after(0, lambda: self.add_task("long_term"))
        
        def hotkey_thread():
            with keyboard.GlobalHotKeys({
                '<alt>+<shift>+s': on_hotkey_short,
                '<alt>+<shift>+l': on_hotkey_long
            }) as listener:
                listener.join()
        
        thread = threading.Thread(target=hotkey_thread, daemon=True)
        thread.start()
        
    def load_data(self):
        self.tasks = {"short_term": [], "long_term": [], "projects": []}
        cur = self.conn.cursor()
        cur.execute("SELECT id, name, description, section, created FROM tasks ORDER BY created DESC")
        for row in cur.fetchall():
            section = row[3]
            task = {
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'created': row[4],
                'section': section
            }
            if section == "projects":
                task['items'] = []
            self.tasks.setdefault(section, []).append(task)
        
        items_by_task = {}
        cur.execute("SELECT id, task_id, text FROM project_items")
        for iid, tid, text in cur.fetchall():
            items_by_task.setdefault(tid, []).append({'id': iid, 'text': text})
        for proj in self.tasks.get("projects", []):
            proj['items'] = items_by_task.get(proj['id'], [])
        
        cur.execute("SELECT value FROM settings WHERE key='font_size'")
        row = cur.fetchone()
        if row:
            try:
                self.font_size = int(row[0])
            except ValueError:
                pass
    
    def init_db(self):
        cur = self.conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                section TEXT NOT NULL,
                created TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS project_items (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                text TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        self.conn.commit()
    
    def insert_task_db(self, task):
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO tasks (id, name, description, section, created) VALUES (?, ?, ?, ?, ?)",
            (
                task['id'],
                task['name'],
                task.get('description', ''),
                task.get('section', 'short_term'),
                task.get('created', datetime.now().isoformat())
            )
        )
        self.conn.commit()
    
    def update_task_db(self, task):
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE tasks SET name = ?, description = ? WHERE id = ?",
            (task['name'], task.get('description', ''), task['id'])
        )
        self.conn.commit()
    
    def update_task_section_db(self, task_id, section):
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE tasks SET section = ? WHERE id = ?",
            (section, task_id)
        )
        self.conn.commit()
    
    def delete_task_db(self, task_id):
        cur = self.conn.cursor()
        cur.execute("DELETE FROM project_items WHERE task_id = ?", (task_id,))
        cur.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self.conn.commit()
    
    def insert_project_item_db(self, task_id, item):
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO project_items (id, task_id, text) VALUES (?, ?, ?)",
            (item['id'], task_id, item['text'])
        )
        self.conn.commit()
    
    def delete_project_item_db(self, item_id):
        cur = self.conn.cursor()
        cur.execute("DELETE FROM project_items WHERE id = ?", (item_id,))
        self.conn.commit()
    
    def save_font_size_db(self, font_size):
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO settings (key, value) VALUES ('font_size', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (str(font_size),)
        )
        self.conn.commit()
    
    def load_env_file(self):
        env_path = Path(__file__).resolve().parent / ".env"
        if not env_path.exists():
            return
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                text = line.strip()
                if not text or text.startswith("#") or "=" not in text:
                    continue
                key, val = text.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
        except OSError:
            pass
            
    def on_closing(self):
        try:
            self.conn.close()
        finally:
            self.root.destroy()
        
    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    app = TooDoo()
    app.run()
