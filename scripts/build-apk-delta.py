"""Generate a verified APK delta for the Android update prototype."""
import argparse
import hashlib
import io
import json
import gzip
import struct
import zipfile
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def entries(data):
    with zipfile.ZipFile(io.BytesIO(data)) as apk:
        for entry in apk.infolist():
            offset = entry.header_offset
            name_size, extra_size = struct.unpack_from("<HH", data, offset + 26)
            start = offset + 30 + name_size + extra_size
            if entry.compress_size:
                yield start, start + entry.compress_size


def create_delta(base, target):
    index = {digest(base[a:b]): a for a, b in entries(base)}
    commands = bytearray()
    cursor = 0

    def literal(start, end):
        if end > start:
            commands.extend(struct.pack("<BI", 0, end - start))
            commands.extend(target[start:end])

    for start, end in sorted(entries(target)):
        offset = index.get(digest(target[start:end]))
        if offset is not None:
            literal(cursor, start)
            commands.extend(struct.pack("<BII", 1, offset, end - start))
            cursor = end
    literal(cursor, len(target))
    return gzip.compress(commands, mtime=0)


def restore(base, patch):
    commands = gzip.decompress(patch)
    output = bytearray()
    cursor = 0
    while cursor < len(commands):
        op, value = struct.unpack_from("<BI", commands, cursor)
        cursor += 5
        if op == 0 and cursor + value <= len(commands):
            output.extend(commands[cursor:cursor + value])
            cursor += value
        elif op == 1:
            length, = struct.unpack_from("<I", commands, cursor)
            cursor += 4
            if value + length > len(base):
                raise ValueError("Copy exceeds base APK")
            output.extend(base[value:value + length])
        else:
            raise ValueError("Invalid delta command")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    base = args.base.read_bytes()
    target = args.target.read_bytes()
    patch = create_delta(base, target)
    if restore(base, patch) != target:
        raise SystemExit("Restored APK differs from target")
    if len(patch) >= len(target):
        raise SystemExit("Delta is no smaller than the full APK")
    with args.output.open("xb") as file:
        file.write(patch)
    print(json.dumps({
        "format": "apk-copy-gzip-v1",
        "baseSha256": digest(base),
        "targetSha256": digest(target),
        "patchSha256": digest(patch),
        "patchBytes": len(patch),
        "targetBytes": len(target),
    }, indent=2))


if __name__ == "__main__":
    main()
