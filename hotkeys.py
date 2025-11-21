from __future__ import annotations

import threading
from typing import Callable

from pynput import keyboard


HotkeyCallback = Callable[[], None]


class GlobalHotkeyListener:
    """
    Runs a background pynput listener for the global hotkeys this app uses.
    Keeps the logic isolated from the main UI so new hotkeys can be added later.
    """

    def __init__(
        self,
        root,
        on_short: HotkeyCallback | None = None,
        on_long: HotkeyCallback | None = None,
        on_translate: HotkeyCallback | None = None,
    ):
        self.root = root
        self.on_short = on_short
        self.on_long = on_long
        self.on_translate = on_translate

    def start(self) -> threading.Thread:
        def schedule(cb: HotkeyCallback | None) -> HotkeyCallback:
            if cb is None:
                return lambda: None
            if self.root:
                return lambda: self.root.after(0, cb)
            return cb

        def hotkey_thread():
            with keyboard.GlobalHotKeys(
                {
                    "<alt>+<shift>+s": schedule(self.on_short),
                    "<alt>+<shift>+l": schedule(self.on_long),
                    "<alt>+<shift>+t": schedule(self.on_translate),
                }
            ) as listener:
                listener.join()

        thread = threading.Thread(target=hotkey_thread, daemon=True)
        thread.start()
        return thread
