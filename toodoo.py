import tkinter as tk
from tkinter import ttk, messagebox
import os
import sys
from datetime import datetime
import threading
import time
from pynput.keyboard import Key, Controller as KeyController

from config import load_env_file
from hotkeys import GlobalHotkeyListener
from task_repository import TaskRepository
from translator_service import TranslatorService

class TooDoo:
    def __init__(self):
        load_env_file()
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
        self.repo = TaskRepository(self.db_url)
        
        # Font size (default)
        self.font_size = 10
        
        # Tasks storage
        self.tasks = {"short_term": [], "long_term": [], "projects": []}
        self.memos = []
        
        # Global keyboard controller for copy/paste actions
        self.keyboard_controller = KeyController()
        
        # Translator
        self.translator = TranslatorService(os.environ.get("OPENAI_API_KEY"))
        
        # Load existing data
        self.load_data()
        
        # Track checkbox clicks for double-click detection
        self.checkbox_clicks = {}
        
        # Setup UI
        self.setup_ui()
        
        # Start global hotkey listener
        self.hotkey_listener = GlobalHotkeyListener(
            self.root,
            on_short=lambda: self.add_task("short_term"),
            on_long=lambda: self.add_task("long_term"),
            on_translate=self.translate_selected_text,
        )
        self.hotkey_listener.start()
        
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
        
        menu_btn = tk.Button(top_frame, text="MENU", command=self.open_menu,
                            bg="#3E3E42", fg="#FFFFFF", relief=tk.FLAT, width=6,
                            font=("Arial", 9, "bold"), cursor="hand2", activebackground="#4E4E52")
        menu_btn.pack(side=tk.RIGHT, padx=(0, 10))
        
        # Hotkey info
        info_text = "Hotkeys: Alt+Shift+S (Short) | Alt+Shift+L (Long) | Alt+Shift+T (Translate)"
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
    
    def open_menu(self):
        menu = tk.Toplevel(self.root)
        menu.title("TooDoo Menu")
        menu.configure(bg="#2D2D30")
        menu.attributes('-topmost', True)
        menu.geometry("340x260")
        
        tk.Label(menu, text="Tools", bg="#2D2D30", fg="#E0E0E0",
                 font=("Arial", 12, "bold")).pack(pady=(12, 6))
        
        tk.Button(menu, text="Add Short Task (Alt+Shift+S)", command=lambda: self.add_task("short_term"),
                  bg="#3E3E42", fg="#FFFFFF", relief=tk.FLAT, width=32, cursor="hand2").pack(pady=4)
        tk.Button(menu, text="Add Long Task (Alt+Shift+L)", command=lambda: self.add_task("long_term"),
                  bg="#3E3E42", fg="#FFFFFF", relief=tk.FLAT, width=32, cursor="hand2").pack(pady=4)
        tk.Button(menu, text="Translate Selection (Alt+Shift+T)", command=self.translate_selected_text,
                  bg="#0D6EFD", fg="#FFFFFF", relief=tk.FLAT, width=32, cursor="hand2",
                  activebackground="#0B5ED7").pack(pady=8)
        tk.Button(menu, text="Memos", command=self.show_memos,
                  bg="#2D6A4F", fg="#FFFFFF", relief=tk.FLAT, width=32, cursor="hand2",
                  activebackground="#3C7A5F").pack(pady=4)
        
        tk.Label(menu, text="Highlight text, press Alt+Shift+T.\nSelect a translation to paste back.",
                 bg="#2D2D30", fg="#A0A0A0", font=("Arial", 9), justify="center").pack(pady=6)
        
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
        
        edit_btn = tk.Button(controls, text="E", command=lambda: self.edit_task(task, section_key),
                           bg="#4A4A4D", fg="#CCCCCC", relief=tk.FLAT, width=2, height=1,
                           font=("Arial", 10), cursor="hand2", activebackground="#5A5A5D")
        edit_btn.pack(side=tk.LEFT, padx=(0, 6))
        
        if section_key in ("short_term", "long_term"):
            move_btn = tk.Button(controls, text="<>", command=lambda: self.move_task(task, section_key),
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
                del_btn = tk.Button(row, text="X", command=lambda iid=item['id'], tid=task['id']: self.delete_project_item(tid, iid),
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
            self.repo.delete_task(task_id)
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
                self.repo.insert_task(task)
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
                self.repo.insert_task(task)
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
                self.repo.update_task(task)
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
                        self.repo.insert_project_item(task['id'], new_item)
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
        self.repo.delete_project_item(item_id)
        self.create_section_ui()
        
    def move_task(self, task, current_section):
        if current_section not in ("short_term", "long_term"):
            return
        target_section = "long_term" if current_section == "short_term" else "short_term"
        self.tasks[current_section] = [t for t in self.tasks[current_section] if t['id'] != task['id']]
        task['section'] = target_section
        self.tasks[target_section].insert(0, task)
        self.repo.update_task_section(task['id'], target_section)
        self.create_section_ui()
        
    def change_font_size(self, delta):
        self.font_size = max(8, min(20, self.font_size + delta))
        self.font_label.config(text=str(self.font_size))
        self.create_section_ui()
        self.repo.save_font_size(self.font_size)
        
    def translate_selected_text(self):
        if not self.translator.api_key:
            messagebox.showinfo("TooDoo", "Set OPENAI_API_KEY to enable translation.")
            return
        
        selected_text = self._copy_selected_text()
        if not selected_text:
            messagebox.showinfo("TooDoo", "No text selected to translate.")
            return
        
        popup = tk.Toplevel(self.root)
        popup.title("Suggestions")
        popup.configure(bg="#2D2D30")
        popup.attributes('-topmost', True)
        popup.resizable(False, False)
        pointer_x = self.root.winfo_pointerx()
        pointer_y = self.root.winfo_pointery()
        popup.geometry(f"+{pointer_x + 10}+{pointer_y + 10}")
        popup.bind("<Escape>", lambda e: popup.destroy())
        
        tk.Label(popup, text=f"Selected: {selected_text}", bg="#2D2D30", fg="#CCCCCC",
                 font=("Arial", 10, "bold"), anchor="w", wraplength=260, justify=tk.LEFT).pack(fill=tk.X, padx=10, pady=(10, 6))
        
        status_label = tk.Label(popup, text="Thinking...", bg="#2D2D30", fg="#A0A0A0",
                                font=("Arial", 9))
        status_label.pack(fill=tk.X, padx=10, pady=(0, 6))
        
        results_frame = tk.Frame(popup, bg="#2D2D30")
        results_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        
        def render_options(data):
            if not popup.winfo_exists():
                return
            for child in results_frame.winfo_children():
                child.destroy()
            
            if not data or not data.get("suggestions"):
                status_label.config(text="No suggestions available. Set TRANSLATOR_DEBUG=1 and retry.")
                tk.Button(results_frame, text="Close", command=popup.destroy,
                          bg="#3E3E42", fg="#CCCCCC", relief=tk.FLAT, width=10, cursor="hand2").pack(pady=6)
                return
            
            status_label.config(text="Choose an option to paste it over the selection.")
            for suggestion in data["suggestions"]:
                label = suggestion.get("label", "")
                replacement = suggestion.get("replacement", label)
                row = tk.Frame(results_frame, bg="#2D2D30")
                row.pack(fill=tk.X, pady=4)
                tk.Button(
                    row,
                    text=label,
                    command=lambda rep=replacement: self._apply_suggestion(rep, popup),
                    bg="#0D6EFD", fg="#FFFFFF", relief=tk.FLAT, anchor="w",
                    cursor="hand2", activebackground="#0B5ED7", padx=8, pady=6
                ).pack(fill=tk.X)
        
        def worker():
            result = self.translator.translate(selected_text)
            self.root.after(0, lambda: render_options(result))
        
        threading.Thread(target=worker, daemon=True).start()
    
    def _apply_suggestion(self, replacement, popup):
        prev_clip = None
        try:
            prev_clip = self.root.clipboard_get()
        except tk.TclError:
            prev_clip = None
        
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(replacement)
            self.root.update_idletasks()
        except tk.TclError:
            if popup and popup.winfo_exists():
                popup.destroy()
            return
        
        modifier = Key.cmd if sys.platform == "darwin" else Key.ctrl
        try:
            self.keyboard_controller.press(modifier)
            self.keyboard_controller.press('v')
            self.keyboard_controller.release('v')
            self.keyboard_controller.release(modifier)
        finally:
            time.sleep(0.05)
            if prev_clip is not None:
                try:
                    self.root.clipboard_clear()
                    self.root.clipboard_append(prev_clip)
                    self.root.update_idletasks()
                except tk.TclError:
                    pass
            if popup and popup.winfo_exists():
                popup.destroy()
    
    def _copy_selected_text(self):
        previous_clipboard = None
        try:
            previous_clipboard = self.root.clipboard_get()
        except tk.TclError:
            previous_clipboard = None
        
        modifier = Key.cmd if sys.platform == "darwin" else Key.ctrl
        self.keyboard_controller.press(modifier)
        self.keyboard_controller.press('c')
        self.keyboard_controller.release('c')
        self.keyboard_controller.release(modifier)
        
        time.sleep(0.15)
        try:
            selected = self.root.clipboard_get()
        except tk.TclError:
            selected = ""
        
        if not selected and previous_clipboard is not None:
            try:
                self.root.clipboard_clear()
                self.root.clipboard_append(previous_clipboard)
                self.root.update_idletasks()
            except tk.TclError:
                pass
        return selected.strip()
        
    def load_data(self):
        tasks, stored_font_size = self.repo.load_state()
        self.tasks = tasks
        if stored_font_size is not None:
            self.font_size = stored_font_size
            
    def on_closing(self):
        try:
            self.repo.close()
        finally:
            self.root.destroy()
        
    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    app = TooDoo()
    app.run()
