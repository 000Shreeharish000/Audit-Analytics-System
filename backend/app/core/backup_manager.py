from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


class BackupManager:
    def __init__(self, backup_dir: str, retention_count: int = 20) -> None:
        self.backup_dir = Path(backup_dir)
        self.retention_count = retention_count
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def create_backup(self, label: str, file_paths: List[str]) -> Dict[str, object]:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        run_dir = self.backup_dir / f"{timestamp}_{label}"
        run_dir.mkdir(parents=True, exist_ok=True)

        copied: List[str] = []
        missing: List[str] = []
        for path in file_paths:
            source = Path(path)
            if source.exists() and source.is_file():
                target = run_dir / source.name
                shutil.copy2(source, target)
                copied.append(str(target))
            else:
                missing.append(str(source))

        self._apply_retention()
        return {
            "backup_dir": str(run_dir),
            "copied_files": copied,
            "missing_files": missing,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def _apply_retention(self) -> None:
        folders = [path for path in self.backup_dir.iterdir() if path.is_dir()]
        folders.sort(key=lambda path: path.name, reverse=True)
        stale = folders[self.retention_count :]
        for folder in stale:
            shutil.rmtree(folder, ignore_errors=True)

    def latest_backups(self, limit: int = 10) -> List[Dict[str, object]]:
        folders = [path for path in self.backup_dir.iterdir() if path.is_dir()]
        folders.sort(key=lambda path: path.name, reverse=True)
        summary: List[Dict[str, object]] = []
        for folder in folders[:limit]:
            files = []
            for file_name in os.listdir(folder):
                full_path = folder / file_name
                if full_path.is_file():
                    files.append(str(full_path))
            summary.append({"backup_dir": str(folder), "files": files})
        return summary

    def restore_backup(
        self,
        backup_dir: str,
        target_file_paths: List[str],
        mode: str = "preview",
    ) -> Dict[str, object]:
        source_dir = Path(backup_dir)
        if not source_dir.exists() or not source_dir.is_dir():
            raise FileNotFoundError(f"Backup directory not found: {backup_dir}")

        restored_files: List[str] = []
        missing_files: List[str] = []
        source_files = {path.name: path for path in source_dir.iterdir() if path.is_file()}

        if mode == "preview":
            preview_dir = self.backup_dir / f"{source_dir.name}_restore_preview"
            preview_dir.mkdir(parents=True, exist_ok=True)
            for file_path in target_file_paths:
                file_name = Path(file_path).name
                source_file = source_files.get(file_name)
                if not source_file:
                    missing_files.append(file_name)
                    continue
                target = preview_dir / file_name
                shutil.copy2(source_file, target)
                restored_files.append(str(target))
        elif mode == "inplace":
            for file_path in target_file_paths:
                target = Path(file_path)
                target.parent.mkdir(parents=True, exist_ok=True)
                source_file = source_files.get(target.name)
                if not source_file:
                    missing_files.append(target.name)
                    continue
                shutil.copy2(source_file, target)
                restored_files.append(str(target))
        else:
            raise ValueError("mode must be either preview or inplace")

        return {
            "backup_dir": str(source_dir),
            "mode": mode,
            "restored_files": restored_files,
            "missing_files": missing_files,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
