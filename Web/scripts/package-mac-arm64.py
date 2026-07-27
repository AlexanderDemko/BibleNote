import json
import hashlib
import os
import plistlib
import shutil
import stat
import struct
import sys
import urllib.request
import zipfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
WEB_DIR = SCRIPT_DIR.parent
REPO_DIR = WEB_DIR.parent
PACKAGE = json.loads((WEB_DIR / "package.json").read_text(encoding="utf-8"))
LOCK = json.loads((WEB_DIR / "package-lock.json").read_text(encoding="utf-8"))
ELECTRON_PACKAGE = json.loads(
    (WEB_DIR / "node_modules" / "electron" / "package.json").read_text(encoding="utf-8")
)
VERSION = PACKAGE["version"]
ELECTRON_VERSION = ELECTRON_PACKAGE["version"]
BUILD_DIR = REPO_DIR / ".codex-build" / "electron-mac-arm64"
ELECTRON_ZIP = BUILD_DIR / f"electron-v{ELECTRON_VERSION}-darwin-arm64.zip"
RELEASE_DIR = WEB_DIR / "release"
OUTPUT_ZIP = RELEASE_DIR / f"BibleNote-{VERSION}-mac-arm64.zip"
APP_PREFIX = "BibleNote.app/"


def platform_supported(meta, key, target):
    values = meta.get(key)
    if not values:
        return True
    positives = [value for value in values if not value.startswith("!")]
    negatives = {value[1:] for value in values if value.startswith("!")}
    return target not in negatives and (not positives or target in positives)


def ensure_electron_zip():
    if ELECTRON_ZIP.exists():
        return
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    url = (
        f"https://github.com/electron/electron/releases/download/v{ELECTRON_VERSION}/"
        f"electron-v{ELECTRON_VERSION}-darwin-arm64.zip"
    )
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, ELECTRON_ZIP)


def zip_info(name, mode, is_dir=False):
    info = zipfile.ZipInfo(name if not is_dir or name.endswith("/") else name + "/")
    info.create_system = 3
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (mode & 0xFFFF) << 16
    if is_dir:
        info.external_attr |= 0x10
    return info


def copy_zip_entry(source_zip, target_zip, source_info, target_name):
    target_info = zipfile.ZipInfo(target_name, date_time=source_info.date_time)
    target_info.create_system = source_info.create_system
    target_info.compress_type = zipfile.ZIP_DEFLATED
    target_info.external_attr = source_info.external_attr
    target_info.comment = source_info.comment
    target_info.extra = source_info.extra
    if source_info.is_dir():
        target_zip.writestr(target_info, b"")
        return
    with source_zip.open(source_info) as source, target_zip.open(target_info, "w") as target:
        shutil.copyfileobj(source, target, length=1024 * 1024)


def icns_bytes():
    chunks = []
    for chunk_type, filename in ((b"ic08", "biblenote-256.png"), (b"ic10", "biblenote-icon.png")):
        data = (WEB_DIR / "assets" / filename).read_bytes()
        chunks.append(chunk_type + struct.pack(">I", len(data) + 8) + data)
    body = b"".join(chunks)
    return b"icns" + struct.pack(">I", len(body) + 8) + body


def modified_info_plist(data):
    info = plistlib.loads(data)
    info.update({
        "CFBundleDisplayName": "BibleNote",
        "CFBundleExecutable": "BibleNote",
        "CFBundleIconFile": "biblenote.icns",
        "CFBundleIdentifier": "local.biblenote",
        "CFBundleName": "BibleNote",
        "CFBundleShortVersionString": VERSION,
        "CFBundleVersion": VERSION,
        "LSApplicationCategoryType": "public.app-category.reference",
        "CFBundleURLTypes": [{
            "CFBundleURLName": "BibleNote Bible references",
            "CFBundleURLSchemes": ["bnverse", "isbtbibleverse"],
        }],
    })
    info.pop("ElectronAsarIntegrity", None)
    return plistlib.dumps(info, fmt=plistlib.FMT_XML, sort_keys=False)


def add_file(target_zip, source, archive_name, executable=False):
    mode = stat.S_IFREG | (0o755 if executable else 0o644)
    info = zip_info(archive_name.replace(os.sep, "/"), mode)
    with source.open("rb") as input_file, target_zip.open(info, "w") as output_file:
        shutil.copyfileobj(input_file, output_file, length=1024 * 1024)


def add_tree(
    target_zip,
    source_root,
    archive_root,
    skip_nested_node_modules=False,
    seen=None,
    executable_predicate=None,
):
    seen = seen if seen is not None else set()
    for current, directories, files in os.walk(source_root):
        current_path = Path(current)
        if skip_nested_node_modules:
            directories[:] = [name for name in directories if name != "node_modules"]
        relative = current_path.relative_to(source_root)
        for filename in files:
            source = current_path / filename
            archive_name = (Path(archive_root) / relative / filename).as_posix()
            if archive_name in seen:
                continue
            if archive_name.endswith("node_modules/better-sqlite3/build/Release/better_sqlite3.node"):
                continue
            add_file(
                target_zip,
                source,
                archive_name,
                executable=bool(executable_predicate and executable_predicate(source)),
            )
            seen.add(archive_name)


def production_package_paths():
    result = []
    for relative, meta in LOCK.get("packages", {}).items():
        if not relative.startswith("node_modules/") or meta.get("dev") is True:
            continue
        if not platform_supported(meta, "os", "darwin"):
            continue
        if not platform_supported(meta, "cpu", "arm64"):
            continue
        package_dir = WEB_DIR / Path(relative)
        if package_dir.is_dir():
            result.append((relative, package_dir))
    return sorted(result, key=lambda item: item[0])


def build_archive():
    ensure_electron_zip()
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_ZIP.with_suffix(".zip.tmp")
    if temporary.exists():
        temporary.unlink()

    with zipfile.ZipFile(ELECTRON_ZIP, "r") as source_zip, zipfile.ZipFile(
        temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True
    ) as target_zip:
        for source_info in source_zip.infolist():
            source_name = source_info.filename
            if not source_name.startswith("Electron.app/"):
                continue
            if "/_CodeSignature/" in source_name or source_name.endswith("/CodeResources"):
                continue
            if source_name.endswith("/Resources/default_app.asar"):
                continue

            target_name = APP_PREFIX + source_name[len("Electron.app/"):]
            if target_name == APP_PREFIX + "Contents/MacOS/Electron":
                target_name = APP_PREFIX + "Contents/MacOS/BibleNote"
            if target_name == APP_PREFIX + "Contents/Info.plist":
                target_zip.writestr(
                    zip_info(target_name, stat.S_IFREG | 0o644),
                    modified_info_plist(source_zip.read(source_info)),
                )
                continue
            copy_zip_entry(source_zip, target_zip, source_info, target_name)

        target_zip.writestr(
            zip_info(APP_PREFIX + "Contents/Resources/biblenote.icns", stat.S_IFREG | 0o644),
            icns_bytes(),
        )

        app_root = APP_PREFIX + "Contents/Resources/app"
        seen = set()
        for directory in ("dist", "assets", "ui"):
            add_tree(target_zip, WEB_DIR / directory, f"{app_root}/{directory}", seen=seen)
        add_file(target_zip, WEB_DIR / "package.json", f"{app_root}/package.json")
        for relative, package_dir in production_package_paths():
            add_tree(
                target_zip,
                package_dir,
                f"{app_root}/{relative}",
                skip_nested_node_modules=True,
                seen=seen,
            )

        native = WEB_DIR / "vendor" / "native" / "darwin-arm64" / "better_sqlite3.node"
        add_file(
            target_zip,
            native,
            f"{app_root}/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
            executable=True,
        )
        add_tree(
            target_zip,
            WEB_DIR / "vendor" / "BibleNote" / "osx-arm64",
            APP_PREFIX + "Contents/Resources/BibleNote",
            seen=seen,
            executable_predicate=lambda source: (
                source.name in {"BibleNote.Application", "createdump"}
                or source.suffix in {".dylib", ".so"}
            ),
        )

    temporary.replace(OUTPUT_ZIP)
    print(f"Created {OUTPUT_ZIP} ({OUTPUT_ZIP.stat().st_size} bytes)")


def validate_archive():
    required_modes = {
        APP_PREFIX + "Contents/MacOS/BibleNote": 0o755,
        APP_PREFIX + "Contents/Resources/BibleNote/BibleNote.Application": 0o755,
        APP_PREFIX + "Contents/Resources/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node": 0o755,
    }
    macho_entries = [
        APP_PREFIX + "Contents/MacOS/BibleNote",
        APP_PREFIX + "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework",
        APP_PREFIX + "Contents/Resources/BibleNote/BibleNote.Application",
        APP_PREFIX + "Contents/Resources/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ]

    with zipfile.ZipFile(OUTPUT_ZIP, "r") as archive:
        corrupt = archive.testzip()
        if corrupt:
            raise RuntimeError(f"Corrupt ZIP entry: {corrupt}")
        names = archive.namelist()
        name_set = set(names)

        for name, expected_permissions in required_modes.items():
            info = archive.getinfo(name)
            permissions = (info.external_attr >> 16) & 0o777
            if permissions != expected_permissions:
                raise RuntimeError(f"Unexpected permissions for {name}: {permissions:o}")

        symlink_count = sum(
            1 for info in archive.infolist()
            if stat.S_ISLNK((info.external_attr >> 16) & 0xFFFF)
        )
        if symlink_count < 14:
            raise RuntimeError(f"Electron framework symlinks were not preserved: {symlink_count}")

        info = plistlib.loads(archive.read(APP_PREFIX + "Contents/Info.plist"))
        if info.get("CFBundleExecutable") != "BibleNote":
            raise RuntimeError("Info.plist does not point to the BibleNote executable")
        if info.get("CFBundleIdentifier") != "local.biblenote":
            raise RuntimeError("Info.plist has an unexpected bundle identifier")

        required_entries = {
            APP_PREFIX + "Contents/Resources/app/dist/electron-main.js",
            APP_PREFIX + "Contents/Resources/BibleNote/libcoreclr.dylib",
            APP_PREFIX + "Contents/Resources/BibleNote/Modules/rst/rst.bnm",
            APP_PREFIX + "Contents/Resources/BibleNote/Modules/kjv/kjv.bnm",
            APP_PREFIX + "Contents/Resources/biblenote.icns",
        }
        missing = required_entries - name_set
        if missing:
            raise RuntimeError(f"Required archive entries are missing: {sorted(missing)}")
        if any(name.endswith("/Resources/default_app.asar") for name in names):
            raise RuntimeError("Electron default_app.asar must not be present")

        for name in macho_entries:
            header = archive.read(name)[:12]
            if len(header) != 12:
                raise RuntimeError(f"Mach-O header is missing from {name}")
            magic, cpu_type, _cpu_subtype = struct.unpack("<III", header)
            if magic != 0xFEEDFACF or cpu_type != 0x0100000C:
                raise RuntimeError(
                    f"{name} is not a 64-bit arm64 Mach-O binary: magic={magic:#x}, cpu={cpu_type:#x}"
                )

    digest = hashlib.sha256()
    with OUTPUT_ZIP.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    print(
        f"Validated macOS arm64 archive: entries={len(names)}, symlinks={symlink_count}, "
        f"sha256={digest.hexdigest()}"
    )


if __name__ == "__main__":
    try:
        if "--validate-only" not in sys.argv:
            build_archive()
        validate_archive()
    except Exception as error:
        print(f"macOS arm64 packaging failed: {error}", file=sys.stderr)
        raise
