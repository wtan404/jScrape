#!/usr/bin/env python3
"""
ops/purge_remote_remnants.py
Safely purges obsolete legacy files and remnants from the remote production/staging FTP server.
Runs during GitHub Actions deployment prior to file synchronization.
"""

import os
import sys
from ftplib import FTP, error_perm

REMNANT_FILES = [
    'test-application.html',
    'config.json',
    'jobs_data.json',
    'job_applications.json',
    'scripts/server.js'
]

REMNANT_DIRS = [
    'dashboard'
]

def clean_remote_remnants():
    server = os.environ.get('FTP_SERVER')
    username = os.environ.get('FTP_USERNAME')
    password = os.environ.get('FTP_PASSWORD')
    target_dir = os.environ.get('FTP_SERVER_DIR', './')

    if not server or not username or not password:
        print("[Purge] Notice: Missing FTP credentials in environment; skipping remote purge.")
        return 0

    print(f"[Purge] Connecting to FTP server {server}...")
    try:
        ftp = FTP(server, timeout=30)
        ftp.login(username, password)
        print("[Purge] Authentication successful.")

        if target_dir and target_dir not in ('.', './'):
            print(f"[Purge] Changing to target directory: {target_dir}")
            ftp.cwd(target_dir)

        # 1. Purge legacy files
        for f in REMNANT_FILES:
            try:
                ftp.delete(f)
                print(f"[Purge] Deleted obsolete remote file: {f}")
            except error_perm as e:
                # 550 usually means file doesn't exist
                if '550' in str(e):
                    print(f"[Purge] File not found (already clean): {f}")
                else:
                    print(f"[Purge] Notice deleting file {f}: {e}")
            except Exception as e:
                print(f"[Purge] Notice deleting file {f}: {e}")

        # 2. Recursively remove remnant directories
        for d in REMNANT_DIRS:
            purge_directory(ftp, d)

        ftp.quit()
        print("[Purge] Remote purge routine completed successfully.")
        return 0
    except Exception as e:
        print(f"[Purge] Warning: Remote cleanup encountered an exception: {e}")
        # Return 0 so CI pipeline is not blocked by non-critical cleanup
        return 0

def purge_directory(ftp, dirname):
    try:
        # Check if dir exists by trying to cwd into it
        original_cwd = ftp.pwd()
        try:
            ftp.cwd(dirname)
        except error_perm:
            print(f"[Purge] Directory not found (already clean): {dirname}")
            return

        # List and remove files inside
        entries = []
        ftp.retrlines('LIST', entries.append)
        for entry in entries:
            parts = entry.split()
            if not parts:
                continue
            name = parts[-1]
            if name in ('.', '..'):
                continue
            is_dir = entry.startswith('d')
            if is_dir:
                purge_directory(ftp, name)
            else:
                try:
                    ftp.delete(name)
                    print(f"[Purge] Deleted internal artifact: {dirname}/{name}")
                except Exception as ex:
                    print(f"[Purge] Could not delete {dirname}/{name}: {ex}")

        ftp.cwd(original_cwd)
        try:
            ftp.rmd(dirname)
            print(f"[Purge] Successfully removed remote directory: {dirname}")
        except Exception as ex:
            print(f"[Purge] Could not rmdir {dirname}: {ex}")
    except Exception as e:
        print(f"[Purge] Notice while processing dir {dirname}: {e}")

if __name__ == '__main__':
    sys.exit(clean_remote_remnants())
