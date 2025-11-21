import json
import os
from datetime import datetime
from pathlib import Path

import requests


class TranslatorService:
    def __init__(self, api_key):
        self.api_key = api_key or ""
        self.api_url = "https://api.openai.com/v1/responses"
        self.debug = os.environ.get("TRANSLATOR_DEBUG", "").lower() in ("1", "true", "yes", "on")
        self.log_path = Path(__file__).resolve().parent / "translator_debug.log"
        # Mirrors the user-provided Pydantic models (without importing pydantic)
        self.schema = {
            "type": "object",
            "properties": {
                "input_word": {"type": "string"},
                "input_language": {"type": "string", "enum": ["en", "ko"]},
                "mode": {"type": "string", "enum": ["english_correction", "korean_to_english"]},
                "suggestions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "replacement": {"type": "string"}
                        },
                        "required": ["label", "replacement"],
                        "additionalProperties": False
                    },
                    "minItems": 1
                }
            },
            "required": ["input_word", "input_language", "mode", "suggestions"],
            "additionalProperties": False
        }

    def translate(self, word):
        word = (word or "").strip()
        if not self.api_key or not word:
            return None
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        system_prompt = (
            "You are a bilingual suggestion helper. "
            "Use the following Pydantic models as the response contract. "
            "Return a JSON object that matches TranslatorResponse. "
            "When the input from the user is Korean, return multiple English word options with diverse meanings. "
            "When the input is English, correct typos and return exactly one corrected word.\n\n"
            "from typing import List, Literal\n"
            "from pydantic import BaseModel, Field\n\n"
            "class Suggestion(BaseModel):\n"
            "    label: str = Field(..., description=\"Text shown in the popup for this option (usually the English word or phrase).\")\n"
            "    replacement: str = Field(..., description=\"Exact text to insert into the document if this option is chosen.\")\n\n"
            "class TranslatorResponse(BaseModel):\n"
            "    input_word: str = Field(..., description=\"The original word selected by the user.\")\n"
            "    input_language: Literal['en', 'ko'] = Field(..., description=\"Detected language of the input word.\")\n"
            "    mode: Literal['english_correction', 'korean_to_english'] = Field(..., description=\"For English input: 'english_correction'. For Korean input: 'korean_to_english'.\")\n"
            "    suggestions: List[Suggestion] = Field(..., description=\"For English input: MUST contain exactly 1 suggestion with the corrected word. For Korean input: MUST contain multiple (e.g. 3–7) diverse English options.\")\n"
            "Only return JSON that conforms to TranslatorResponse."
        )
        payload = {
            "model": "gpt-5.1",
            "reasoning": {"effort": "low"},
            "input": [
                {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
                {"role": "user", "content": [{"type": "text", "text": word}]}
            ],
            "max_output_tokens": 256,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "TranslatorResponse",
                    "strict": True,
                    "schema": self.schema
                }
            }
        }
        try:
            self._log("request", {"payload": {k: v for k, v in payload.items() if k != "response_format"}})
            resp = requests.post(self.api_url, json=payload, headers=headers, timeout=20)
            resp.raise_for_status()
            data = resp.json()
            self._log("response_ok", {"status": resp.status_code, "body": data})
            parsed = self._extract_parsed_json(data)
            result = self._coerce_response(parsed, word)
            if not result:
                result = self._fallback_response(word)
            self._log("parsed_result", result)
            return result
        except requests.RequestException as exc:
            self._log("response_error", {"error": str(exc), "body": getattr(exc, "response", None) and getattr(exc.response, "text", "")})
            return self._fallback_response(word)
        except Exception as exc:  # noqa: BLE001
            self._log("unexpected_error", {"error": str(exc)})
            return self._fallback_response(word)

    def _extract_parsed_json(self, data):
        # Best effort handling across possible response shapes
        output = data.get("output") if isinstance(data, dict) else None
        if isinstance(output, list):
            for block in output:
                if not isinstance(block, dict):
                    continue
                # Direct output_json from Responses API
                if block.get("type") == "output_json" and "json" in block:
                    return block.get("json")
                if block.get("parsed"):
                    return block.get("parsed")
                content = block.get("content")
                if isinstance(content, list):
                    for c in content:
                        if isinstance(c, dict):
                             # output_json may be nested
                            if c.get("type") == "output_json" and "json" in c:
                                return c.get("json")
                            if "parsed" in c:
                                return c.get("parsed")
                            if "text" in c:
                                try:
                                    return json.loads(c["text"])
                                except (json.JSONDecodeError, TypeError):
                                    continue
        # Fallback to top-level choices (older APIs)
        try:
            return json.loads(data.get("choices", [{}])[0].get("message", {}).get("content", ""))
        except Exception:
            return None

    def _coerce_response(self, parsed, word):
        if not isinstance(parsed, dict):
            return self._fallback_response(word)
        result = {
            "input_word": parsed.get("input_word", word),
            "input_language": parsed.get("input_language") or ("ko" if self._looks_korean(word) else "en"),
            "mode": parsed.get("mode"),
            "suggestions": parsed.get("suggestions") or []
        }
        if result["input_language"] == "ko":
            result["mode"] = "korean_to_english"
            if len(result["suggestions"]) < 3:
                cleaned = self._dedup_suggestions(result["suggestions"])
                while len(cleaned) < 3 and cleaned:
                    cleaned.append({"label": cleaned[0]["label"], "replacement": cleaned[0]["replacement"]})
                result["suggestions"] = cleaned or [{"label": word, "replacement": word}]
        else:
            result["input_language"] = "en"
            result["mode"] = "english_correction"
            if result["suggestions"]:
                first = result["suggestions"][0]
                result["suggestions"] = [{"label": first.get("label", word), "replacement": first.get("replacement", word)}]
            else:
                result["suggestions"] = [{"label": word, "replacement": word}]
        return result

    def _dedup_suggestions(self, suggestions):
        seen = set()
        cleaned = []
        for item in suggestions:
            label = (item.get("label") or "").strip()
            repl = (item.get("replacement") or "").strip()
            key = (label.lower(), repl.lower())
            if label and repl and key not in seen:
                seen.add(key)
                cleaned.append({"label": label, "replacement": repl})
        return cleaned
    
    def _fallback_response(self, word):
        lang = "ko" if self._looks_korean(word) else "en"
        if lang == "ko":
            suggestions = [{"label": word, "replacement": word}]
            mode = "korean_to_english"
        else:
            suggestions = [{"label": word, "replacement": word}]
            mode = "english_correction"
        return {
            "input_word": word,
            "input_language": lang,
            "mode": mode,
            "suggestions": suggestions
        }
    
    def _looks_korean(self, text):
        return any("\uac00" <= ch <= "\ud7a3" for ch in text)
    
    def _log(self, category, payload=None):
        if not self.debug:
            return
        try:
            safe_payload = payload or {}
            text = json.dumps({
                "category": category,
                "data": safe_payload
            }, ensure_ascii=False)
            timestamp = datetime.now().isoformat()
            with self.log_path.open("a", encoding="utf-8") as fh:
                fh.write(f"{timestamp} {text}\n")
        except Exception:
            pass
